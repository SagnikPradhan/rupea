# Postgres, served or embedded

Rupee runs as a service for many users and as an app people install. Both use Postgres 18 with pgvector. With `DATABASE_URL` set, the server connects to it through `pg`. Without it, the server runs PGlite in-process from `RUPEE_DATA_DIR/postgres`. Both drivers sit under drizzle's `pg-core` dialect, so nothing above `src/lib/server/db` knows which one it has. The server migrates on boot in either case, since nobody installing an app runs a migration step.

SQLite was dropped because it had no vector search on the ORM connection, weaker indexes (no trigram or operator-class indexes), and a synchronous driver that needed a worker pool behind a proxy, which in turn ruled out interactive transactions.

## Considered Options

- **Stay on SQLite**: the ceiling is the engine itself, and the service would outgrow it.
- **System Postgres binaries started by the server**: real Postgres everywhere, but an app user would have to install Postgres and pgvector first.
- **Bundled native Postgres (`embedded-postgres`) with our own pgvector builds**: real Postgres on the desktop too, but we would own a per-platform extension build.
- **A Docker image for app users**: the same install burden as system Postgres.

## Consequences

- Only extensions that PGlite also ships may be used: pgvector, pg_trgm and the contrib modules.
- Embedded Postgres has one connection and runs on the Node main thread, so a long query stalls other requests. That is acceptable for one person on a desktop. If it stops being acceptable, swap the embedded runtime for bundled native Postgres; only `src/lib/server/db/index.ts` changes.
- A data directory belongs to one Postgres major version, and PGlite has no `pg_upgrade`. Moving off 18 needs a dump and restore on first launch; that is not built yet.
- Tests run on PGlite: each file starts from a dump of a migrated template. The service's `pg` path is not exercised in CI yet.
- Migrations are read from `drizzle/` relative to the working directory, so a packaged app must ship that directory beside the server.
