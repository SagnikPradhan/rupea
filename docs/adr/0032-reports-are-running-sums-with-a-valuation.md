# Reports are running sums over postings, valued then or now

Net worth, returns, spending and holdings each have a purpose-built read, and each repeats the walk from a commodity to rupees. A plain-text ledger with double entry is easy to report on because every report is a running sum over postings with a choice of price. hledger names the choices: `then` values each amount at the price of its own day, and `now` values the whole sum at the price of the day shown. New reports are written that way, as a sum of moves and a valuation, and not as a function for one data model.

Cost over time is the first. A lot is a posting that took units in at a cost, and a disposal gives units up at the cost of the lot they come from. Cost is the running sum of those moves valued `then`, so a sale takes out what its lots cost and not what it fetched, as in hledger's `--gain` and Fava's at-cost view. Value is the worth the ledger already works out, kept to the holdings with lots and valued `now`. The gain is the gap between them. A foreign holding's cost is taken at the rate of the day it was bought, which is how Indian capital gains on foreign assets are worked out, so currency moves belong to the gain. This is not tax advice.

`listCostMoves` sums lot and disposal moves by account, commodity and day in one indexed query. `listRatesThen` values each cost currency on each of its days through the same prices as flows and spending. `costOn` adds the moves up in `domain/cost.ts`. Nothing is stored, since a lot already holds its cost and day.

The account set is the accounts the filter names and those under them that have lots, so no flag excludes an account. No plain-text tool has one: they use the Assets and Liabilities roots and `not:` patterns. When one is wanted, it should be a plain directive or tag on the account in the ledger text, as hledger's `type:` is, so the file stays portable.

On the `twenty-years` fixture, against net worth over the same spans:

| Mean over 20 years | Net worth | Value against cost |
| ------------------ | --------- | ------------------ |
| 1 year             | 13 ms     | 36 ms              |
| 10 years           | 54 ms     | 69 ms              |
| All                | 109 ms    | 134 ms             |

Over 50 years all of history takes 232 ms against 224 ms, and on `wide` ten years takes 159 ms against 166 ms.

A drop is measured on the same walk. Each day, the holdings of the day before are valued at the prices of both days, so what changed between them is price alone, and a deposit or a withdrawal moves neither. Chaining those changes gives an index that starts at one, and a drop is how far the index stands below its high so far. It is computed for the holdings with lots, as the chart above, and for each account with lots on its own. Over 20 years it takes 107 ms for all of history, against 106 ms for the chart.

## Considered Options

- **Cost as net cash in**: a sale takes out what it fetched, as in Portfolio Performance and Wealthfolio. It needs no lots, but a profitable sale leaves a cost that no lot matches, and the gain disagrees with the one in the table of accounts.
- **Cost valued now**: one rate for every day, but a currency move is counted as growth in the asset, and it disagrees with the rupee cost of a foreign purchase.
- **A cost column in the year rows**: nothing to sum on read, but every edit rewrites it, and the read was fast enough without.

## Consequences

- Returns, spending, holdings and the cost behind the accounts table are not yet written this way. `listFlows` and `listSpending` repeat the rate walk that `listRatesThen` now holds. Moving each onto the shared sum is the direction, one read at a time, each measured by the same bench.
- The accounts table and its figures still value the cost of a lot at the price of the day shown, so for a holding bought in another currency they differ from the chart until the holdings move onto the shared sum.
- A cost currency with no price on the day it was paid leaves that move out of cost, and no unpriced count says so yet.
