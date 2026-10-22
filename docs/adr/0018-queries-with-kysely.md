# Queries with Kysely, schema with Drizzle

The ledger's queries grew into CTEs, lateral joins, window functions and a recursive walk over prices. In Drizzle each of those is a table object or a `.as()` subquery passed around in TypeScript, so a query reads as a web of variables rather than as the SQL it runs. Kysely names tables, aliases and CTEs as strings, the way SQL does, and checks every name against the schema: `selectFrom('postings as p').innerJoin('transactions as t', 't.id', 'p.transactionId')` fails to compile when a column is misspelt.

**Every query goes through Kysely.** The context's `db` is a `Kysely<Tables>` over the shared `pg` pool, with `CamelCasePlugin`, so code speaks camelCase and Postgres stays snake_case. One builder means one transaction mechanism: `atomically` opens a Kysely transaction, and inside one it takes a savepoint. An adapter that needs a transaction of its own calls `transaction(db, f)`, which joins the open one.

**Drizzle stays the schema.** Tables are still declared in each service's `database-schema.ts`, drizzle-kit still generates migrations, and the server still applies them with Drizzle's migrator. `Tables` in `db/tables.ts` derives Kysely's types from those declarations with `Kyselify`, so there is one definition of every column.

**What the builder cannot say is a named expression.** `anyOf`, `total`, `runningTotal` and the rest in `db/expressions.ts` take typed expressions from `e.ref(...)`, never raw strings, so a renamed column still fails to compile.

## Considered Options

- **Stay on Drizzle's query builder**: one library, but tables referenced as objects make larger queries hard to read as SQL, which was the reason to look.
- **Kysely for the ledger only**: what the spike started with. Two builders and two transaction mechanisms meant `atomically` covered one and not the other.
- **Prisma 8 with its query builder**: typed and well supported, but CTEs need raw SQL, and most of the ledger's queries are built from them.
- **Kysely for the schema too**: Kysely has no schema DSL or migration generator, so migrations would be written by hand.

## Consequences

- Dates come back as text and amounts as exact bigints, because Kysely gets what the driver returns; `db/index.ts` gives its pool its own type parsers, leaving the driver's global ones alone.
- jsonb values are written through `json()`, since the driver sends a JavaScript array as a Postgres array.
- A table needs both a Drizzle declaration and an entry in `Tables`.
