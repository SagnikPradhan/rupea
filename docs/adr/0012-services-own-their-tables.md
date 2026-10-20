# Services own their tables

Each service defines its tables in `adapters/database-schema.ts`, and only that service reads or writes them. Another service's table may be imported for one thing: a foreign key to it. A query never joins across services; when a service needs another's data, it calls that service's application. This extends [ADR 0007](0007-service-boundaries.md) from code to data.

| service    | tables                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| auth       | `users`, `sessions`, `email_codes`                                                                              |
| storage    | `storages`                                                                                                      |
| ledger     | `ledgers`, `memberships`, `ledger_files`, `transactions`, `postings`, `prices`, `lots`, `disposals`, `metadata` |
| extraction | `statements`, `statement_contents`                                                                              |
| refinement | `dismissed_matches`                                                                                             |
| jobs       | `jobs`                                                                                                          |

A fixed value set is a TypeScript `enum` in the domain that uses it, and `database-schema.ts` builds its `pgEnum` from it, so imports point from adapters to the domain and never back. The columns every table spreads, `base`, live in `db/columns.ts`. drizzle-kit reads every `services/*/adapters/database-schema.ts`.

## Considered Options

- **One schema file for every table**: what we had. Nothing showed which service a table belonged to, and prediction wrote the ledger's `transactions` while the ledger joined storage's `storages`.
- **Reads across services allowed, writes not**: keeps joins in one query, but a table read by two services can't change without both.
- **`users` kept in a shared core schema**: auth creates and names users, so the table would sit outside the one service that writes it.

## Consequences

- Prediction is part of the ledger, as its own orchestrator, since it searches the ledger's transactions and postings in one indexed query ([ADR 0007](0007-service-boundaries.md)).
- A ledger records its owner in `ledgers.owner_id`, instead of reaching it through its storage. The ledger opens its files with the storage of its owner.
- `storages`, `memberships`, `ledgers` and `jobs` import `users` for their foreign keys.
- Test fixtures in `tests/shared/` sit outside every service and may write any table.
