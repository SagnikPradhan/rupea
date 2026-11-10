# Deltas keep what came in and what went out, beside their sum

A delta was one signed amount per account, commodity and day, which is all spending, income and worth need. It cannot say how much a card was drawn on in a year when it was also paid off, because the two cancel in the stored sum. The Liabilities page needs both ([ADR 0033](0033-one-delta-read-and-a-public-ledger-surface.md)).

`daily_deltas` and `monthly_deltas` now also hold an **inflow**, the positive counted postings summed, and an **outflow**, the negative ones summed and made positive. The amount stays, as inflow less outflow. Both columns add up the way the amount does, so a month still sums its days, a span still reads at most two partial months of days, and the work does not grow with the number of postings. `deltasBetween` returns them with the amount, `listDeltas` values each at the same price as the amount, and every total and bucket carries them. Reports that need only the net ignore them.

The migration adds the columns with a default of nothing, replaces the view, and fills the stored months from it, so no ledger has to be rebuilt. The drift check compares the three columns.

## Considered Options

- **A query over postings for liabilities only**: no change to the caches, but a second way to read the same ledger, and a read that grows with postings instead of months.
- **Estimating drawn and paid from the monthly nets**: no schema change, but spending and paying off in one month would show as neither.

## Consequences

- A delta in a commodity with no price is still left out and counted as unpriced, for its inflow and outflow as for its amount.
- Inflow and outflow are gross over an account and the accounts under it, so a transfer between two sub-accounts counts in both. A report that must leave transfers out has to read postings, as `listFlows` does.
