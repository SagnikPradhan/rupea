# Postgres, served or embedded

Rupee runs as a service for many users and as an app people install. Both use Postgres 18 with pgvector. With `DATABASE_URL` set, the server connects to it. Without it, the server starts its own Postgres from [portable-pg](https://github.com/SagnikPradhan/portable-pg), with its data in `RUPEE_STORAGE_FILES/postgres`, on a Unix socket only its user can open. Both paths use the same `pg` driver, so nothing above `src/lib/server/db` knows which one it has. The server migrates on boot in either case, since nobody installing an app runs a migration step.

SQLite was dropped because it had no vector search on the ORM connection, weaker indexes (no trigram or operator-class indexes), and a synchronous driver that needed a worker pool behind a proxy, which in turn ruled out interactive transactions.

## Considered Options

- **Stay on SQLite**: the ceiling is the engine itself, and the service would outgrow it.
- **PGlite**, used until October 2026: Postgres compiled to WebAssembly, running in-process. It had one connection on the Node main thread, so a long query stalled every request, and the tests ran about twice as slow as on native Postgres.
- **System Postgres binaries started by the server**: an app user would have to install Postgres and pgvector first.
- **`embedded-postgres` from npm**: native Postgres, but without pgvector, which we would have had to build per platform anyway.
- **A Docker image for app users**: the same install burden as system Postgres.

## Consequences

- Only extensions portable-pg ships may be used: pgvector and the contrib modules. Adding another means a portable-pg release.
- Embedded mode runs on Linux x64 and arm64 with glibc 2.34 or newer. macOS and Windows app users need a portable-pg build first.
- The first start downloads about 8 MB of binaries into `~/.cache/portable-pg`. A packaged app should fetch them ahead of time.
- A data directory belongs to one Postgres major version. portable-pg ships `pg_upgrade`, but moving off 18 is not built yet.
- Data directories PGlite created cannot be opened: it is a 32-bit build and stores data in a different layout. Moving one needs a dump and restore.
- Tests run on portable-pg, the same driver path the service uses. Each test file gets a copy of a template database migrated once per run.
- Migrations are read from `drizzle/` relative to the working directory, so a packaged app must ship that directory beside the server.
