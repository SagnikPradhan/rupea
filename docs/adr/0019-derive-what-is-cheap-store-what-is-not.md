# Derive what is cheap, store what is not

A sync writes what the files say: transactions, postings, prices and metadata. Anything worked out from those rows is either derived when it is read, or written by the sync and kept in step with them. Every derived table is code that has to keep it in step, so it has to earn its place.

**A fact is a view when reading it stays fast.** Daily balance changes, `daily_deltas`, are a plain view over counted postings, written once in the ledger migration. On four ledgers of 30 years at ten transactions a day (877,000 postings), the table it replaced was faster to read: 8 ms against 114 ms for holdings, 123 ms against 354 ms for balance checks, 479 ms against 580 ms for 30 years of net worth. But every sync that touched rupees rebuilt the table's rupee rows, which took 1.8 s. The view costs nothing to write, and a sync reads balance checks once, so a sync comes out faster too.

**A fact is stored when it depends on order.** Lots are matched to sales first in, first out, across files, so whether a sale finds its lot depends on every earlier one. No query works that out cheaply, so a sync books lots and keeps them.

## Considered Options

- **A materialized view**: Postgres refreshes one whole, across every ledger, so each sync would recount every user's postings.
- **pg_ivm**, which keeps a materialized view up to date as rows change: an exclusive lock on the view lasts until the writing transaction commits, so one user's sync would hold up every other user's.
- **Date and counted copied onto postings, with a covering index**: reads came out between the view and the table, at the cost of two copied columns to keep in step.

## Consequences

- `daily_deltas` has no Drizzle declaration, so its row type is written out in `Tables`.
- A sync tracks only the commodities whose lots it touched.
- Revisit this if reading balances at real scale is too slow; the copied columns are the next step before a table.
- [ADR 0022](0022-history-before-a-range-from-monthly-deltas.md) took that step: postings now carry date and counted, and monthly deltas and balance checks are stored.
