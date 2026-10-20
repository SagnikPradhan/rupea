# Services meet only through their application layer

A service's `application/` is its only public surface; no service imports another's `domain/` or `adapters/`. Orchestrators stay in `application/<service>.ts`. A part that reads plainly on its own but is too coupled to the service's data to be a service gets its own orchestrator, `application/<part>.ts`, and its adapters may split the same way. The types and pure functions other services need are re-exported from `application/shared.ts`, while the code itself stays in `domain/`. One application may call another's.

Extraction turns arbitrary input into ledger input, so the ledger owns what that input looks like and how it is written: its `shared.ts` exports `Amount`, `RupeeTransaction`, `accountType`, `DEFAULT_COMMODITY`, date parsing, `print` and `parse`. Extraction builds transactions and calls the ledger's `print`. Choosing an account, fallback included, is the ledger's `application/prediction.ts`, which exposes only `predictAccounts`: it searches the ledger's own transactions and postings, so it can't be a service of its own ([ADR 0012](0012-services-own-their-tables.md)).

## Considered Options

- **Moving amounts and dates to `shared/`**: they are the ledger's input, not general utilities, and `shared/` would grow into a place for anything used twice.
- **Extraction returns transactions and the route prints them**: the route would compose two services that one call can hide.
- **Prediction as a service**: what we had. It wrote embeddings onto the ledger's transactions and joined its postings, so its tables were the ledger's.

## Consequences

- Storage is a service of its own, owning the `storages` table and `withStorage`. Ledger and extraction both open storages through it, so neither depends on the other for that, and auth does not touch the table. A ledger records its owner and opens the owner's storage.
- Only the ledger edits ledger files, event links included. Refinement suggests and names events and hands the links to the ledger, which renames events and swaps their primary too.
- `shared/` holds only what belongs to no service. `shared/names.ts` qualifies: auth names users, the ledger names ledgers, refinement names events.
- Tests follow the same rule.
