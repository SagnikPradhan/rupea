# Returns compose the two reads

[ADR 0041](0041-bridge-composes-the-two-reads.md) left drops and returns to walk days. Returns is now the second to move onto the two generic reads of [ADR 0039](0039-two-generic-reads-and-a-filter-tree.md). It no longer walks every day of the span, and no read treats a part of the ledger as special.

## The composition

Returns for a span is a handful of reads and two pure functions.

- The balances read for the day before the span, and for its last day, over Assets, says what each account held at the two ends.
- The deltas read by date over Assets, valued at cost, says what each account gained each day. A posting that names a price is worth that price, so a purchase is not a gain.
- The deltas read by posting over Assets, with the earning filter, says which postings carried money in or out of the portfolio. That filter keeps the postings whose transaction has another posting on an investment income account, which are Income:Interest, Income:Dividends and Expenses:Fees. The bucket posting gives one row for each posting with its transaction and position.
- One deltas read by posting for each investment income account that the ledger has says which dividends and interest came in. Each is its own read of one account.

A pure function in the flows module turns the date rows and the posting rows into the dated cash flows of every account, and a pure function in the returns module turns balances and flows into the rate of return, as before. Application code is only the composition. The answers are the same as the old walk gave, byte for byte.

## What was slow and why

The first version asked for all earning postings with one filter that was an or of counter tests, one for each income account. The database planned each test as a separate separate plan run for every posting, and the read took 12 seconds. The fix is in the filter compiler. An or made only of account tests is now one test of the account being in one list of accounts, so it is one subquery and the planner uses an index. The same filter is cheap now.

Two smaller changes came with it. The deltas read has a bucket for a single posting, and a valued setting of cost. The deltas read takes a span of any length by date, and comes back with the days that had deltas only, so it costs what they do. The refusal of a span over 1827 days by date lives in the endpoint that pages call, which checks it before the read, counting from the first day with data when the span starts at the beginning, so returns and drops can read longer spans.

## Numbers

Means over ten samples on the same machine, in milliseconds, for returns across the whole history, a year and a month. The full tables are in the benchmarks document.

| fixture      | case          | before | after |
| ------------ | ------------- | -----: | ----: |
| twenty-years | returns all   |    125 |   101 |
| twenty-years | returns year  |     44 |    40 |
| twenty-years | returns month |     42 |    21 |
| fifty-years  | returns all   |    185 |   188 |
| fifty-years  | returns year  |     70 |    29 |
| fifty-years  | returns month |     67 |    25 |
| wide         | returns all   |     56 |    64 |
| wide         | returns year  |     34 |    39 |
| wide         | returns month |     32 |    38 |

Returns for all history on fifty-years is 188 milliseconds, over the 150 millisecond gate. The short spans on wide cost a few milliseconds more, as several small reads replace one walk of a few days. About 100 of those milliseconds are one aggregation of 52 thousand postings by day in the deltas read over Assets. Making that faster needs a stored rollup by day, so it waits for the rollup decision, together with drops.

## Considered Options

- **Keep the walk**: it rebuilds the price of every commodity on every day, and it is what the other reads moved away from.
- **Keep the or of counter tests**: it is the simplest filter to state, and it took 12 seconds. The list of accounts says the same thing to the planner in a form it can use.
- **Add a rollup now**: it would bring all history on fifty-years under the gate, but it adds a table and its upkeep for one case, and drops need the same decision.

## Consequences

- Returns for all history on fifty-years stays over 150 milliseconds, at 188, until the rollup decision.
- Drops is the last to walk days.
- The holdings helpers, the holdings read and the old balances read that the walk used are gone, with the tests of the valuing function.
