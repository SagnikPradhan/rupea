# A daily cost table for returns

[ADR 0042](0042-returns-compose-the-two-reads.md) works out an account's returns from the balances at the two ends of a span and a read of what flowed in and out of each Assets account on each day, valued at cost: a posting that names a price is worth that price, and the rest are worth their own. That read grouped every counted posting of the Assets accounts by day on each request. across all history on the fifty-years ledger, returns took 229 ms, and the cost read was the largest part of it.

[ADR 0019](0019-derive-what-is-cheap-store-what-is-not.md) says a derived table has to earn its place, and it left the daily deltas as a view because a table cost more to write than it saved. This one is different, because the view cannot hold what returns need. The view sums amounts, and the cost of a posting depends on its price, so the cost is worked out from each posting before it is summed. That is the part of the read that grows with history.

## What is stored

`daily_costs` has one row for each ledger, account, commodity, cost commodity and date. The cost commodity is the commodity the posting was paid in, or the commodity itself when it names no price. The row holds the cost, signed and exact like every amount, with what came in and what went out as the monthly deltas hold them ([ADR 0036](0036-deltas-keep-what-came-in-and-what-went-out.md)), and the number of postings, which the read uses to count what has no price. Only counted postings of asset and liability accounts are stored.

Its rows are rewritten where the monthly deltas are, in the same transaction. A settle deletes the rows of the holdings it touched between the first and last day it changed and writes them again from the postings. The twelve months the check comes round to ([ADR 0022](0022-history-before-a-range-from-monthly-deltas.md)) are rewritten too, so a day left wrong is put right as a month is. The migration that creates the table also fills it from the postings, so a ledger indexed before the table is right at once.

The cost read takes the days of the balance accounts from the table and the days of every other account from the postings, so it is still one read with the same result. A read of each posting alone, or one that filters postings, reads the postings as before, since the table has lost the transaction and position of each.

## Why only cost

Returns do not read the amounts of the balance accounts by day. Units come from the monthly deltas and the balances read, and the earning postings stay on the postings. A table that held the amounts as well, one row for each balance posting grouped by day, would be read by nothing that is slow, and every sync would write it. The cost is the one column returns need that no existing table has.

## What it costs

- Writing: a settle reads the postings of the months it touched a second time, to group their costs. Editing the oldest file on the fifty-years ledger takes 114 ms with the table and 97 ms without it, still under the 250 ms the write may take.
- Storage: 39,516 rows on the fifty-years ledger, 8.5 MB freshly built, 5.8 MB of rows and 2.7 MB of its unique key. The benchmark ledger, which is rewritten many times before it is measured, holds 18.6 MB until the database vacuums it. The same ledger's postings take 87 MB.

## What it changed

The bench of the accounts service, in milliseconds, mean and 99th percentile. Before is the committed benchmarks file. After is the second of two runs on the same machine.

| Case                      | Before   | After    |
| ------------------------- | -------- | -------- |
| Returns all, twenty-years | 113, 120 | 86, 96   |
| Returns all, fifty-years  | 229, 252 | 173, 182 |
| Returns all, wide         | 55, 60   | 50, 54   |
| Bridge all, fifty-years   | 106, 110 | 109, 111 |

Returns across all history on fifty years falls by 56 ms and stays 23 ms over the 150 ms the read is meant to meet. Read alone across all history, the cost read falls from 165 ms to 114 ms. What is left is the 20,800 rows the read still returns, one for each account and day, which are sorted, converted and valued in the database, then decoded and added up in the server, and a second read of the earning postings that stays on the postings.

The bench of the files service, in milliseconds, mean. Without is the same machine with the table's rewrite switched off.

| Case                      | Without | With |
| ------------------------- | ------- | ---- |
| Edit oldest, twenty-years | 112     | 133  |
| Edit newest, twenty-years | 92      | 113  |
| Import 100, twenty-years  | 44      | 64   |
| Edit oldest, fifty-years  | 97      | 114  |
| Edit newest, fifty-years  | 85      | 98   |
| Import 100, fifty-years   | 43      | 59   |

## Decision

On 2026-11-18 the user decided to keep the table and to waive the 150 ms gate for returns across all history on the fifty-years ledger, which takes about 175 ms on average. The gate is not met. The table is kept because it still takes 54 ms off that read and 27 ms off the twenty-years read, and no cheaper change was left.

What limits the read now is spread over three parts. The cost read takes about 83 ms, the earning read about 38 ms, and the price years and the solver about 44 ms. None of them is large enough alone to bring the total under the gate.

## Consequences

- The cost read has a second source to keep in step. The tests build a ledger with buys, sells, a foreign commodity and prices, and require the stored read and the posting read to give the same rows, and require the table to equal a fresh build after an edit, a delete and a import again.
- A change to how a posting is valued at cost has to change the expression in two places: the read of postings and the write of the table. They share one function.
- Revisit this if the cost of a ledger of many accounts grows faster than the reads it saves.
