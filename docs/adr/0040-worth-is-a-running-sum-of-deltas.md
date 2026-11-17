# Worth is a running sum of deltas, valued at the end of each bucket

[ADR 0032](0032-reports-are-running-sums-with-a-valuation.md) said a report is a running sum with a choice of price, and [ADR 0039](0039-two-generic-reads-and-a-filter-tree.md) split every report into two reads. The deltas read already worked that way. The balances read did not: to say what accounts held at the end of each day, it laid every holding out over every day of the span, from year rows of daily balances, and valued each day in application code. Its cost grew with the length of the span and with the number of holdings, and was the slowest part of the home page on `wide`.

## Profile

Each case was timed as a whole, then each database call alone, then the application part, and a CPU profile of 20 calls was read for where the application spent it. Means over 15 runs, in milliseconds.

| part                                      | home worth 5y, wide | home worth all, fifty-years | holdings all, fifty-years |
| ----------------------------------------- | ------------------: | --------------------------: | ------------------------: |
| whole call                                |                 127 |                          63 |                        35 |
| account tree, problems, first day         |                 2.4 |                         1.5 |                       1.5 |
| balance years, price sources, price years |                 7.9 |                        14.8 |                       3.3 |
| laying the holdings out day by day        |                  75 |                          34 |                       0.6 |
| building the rows                         |                 6.7 |                         0.6 |                       0.0 |
| rolling the rows up into accounts above   |                  24 |                         3.6 |                       0.1 |

The database is not the problem. The database calls together took about ten milliseconds, and most of the holdings call outside the database is the lots read, which is not a worth read. Application code dominates, and the CPU profile says where: reading sixteen-byte amounts out of year buffers one day at a time, building a price for every commodity on every day of the span, one multiplication of big numbers per holding and day, and the garbage left by eighty thousand rows. On `wide` five years is 1827 days of 44 holdings. The hundred-year span guard keeps it bounded, but nothing stops the work growing with history, which is the wrong direction for a hosted service.

## The read

A bucket's balance is what the accounts held before the span, plus every delta up to the end of the bucket.

- What each account held of each commodity before the span comes from the monthly delta cache ([ADR 0022](0022-history-before-a-range-from-monthly-deltas.md)): the months before it and at most a month of days.
- What each account gained of each commodity in each bucket of the span is a second indexed read of the same cache and the daily view. It is in units, not valued, and only the buckets with a move have a row.
- The running sum adds the gains bucket by bucket, in application code, starting from the opening. A bucket with no move costs one addition.
- Each bucket is then valued at the price of one day, which is the last day of the bucket unless the caller says another. The days are an argument of the pricing function, so valuing the whole history at today's prices is the same code with a different list of days.
- The base commodity is an argument of the sum. The price walk still ends in rupees, as the rest of the worth code does, until the ledger holds its base.

The result is the same rows as before, down to the bucket, the commodity split and the count of holdings with no price. A holding that came back to nothing still has its rows, and a span that starts after the first day starts from what was held before it.

A holding with units and no price on the day it is valued counts as nothing, as before, and now also fails its account in the batch, once for each account that holds one, with the number of such holdings. The failure type is the one the returns use, since a new type needs an entry in the contract's table of statuses. A type of its own, named for worth, is the right end state and costs one line there.

Units, value, cost, price and paid are all read this way. The day by day walk is no longer used by the balances read.

## Cost, price and paid

Cost and paid come from the lots, and they are sums too, so they take the same shape as units. A lot is a signed amount in the commodity it cost in, taken in on the day of its posting, and a sale gives units back at the cost of the lot it comes from. What the lots of an account and commodity had cost is the sum of those amounts up to a day, one sum for each commodity they cost in.

- Before the span, the lots read adds up each account, commodity, cost commodity and day paid for, over every day before the first one. A cost that came back to nothing is left out.
- In the span, a second read adds the same amounts by account, commodity, cost commodity, day paid for and bucket, with the bucket worked out by the database.
- Paid values each of these amounts at the price of the day its lot was paid for, which is one price for each cost commodity and day, read in one query. It is added up by bucket like units are. A cost in a commodity with no price on that day counts nothing, and is reported as before.
- Cost is the running sum for each cost commodity, valued at the price of the bucket's last day and added up. A cost commodity with no price then makes the cost nothing and counts as one unpriced.
- Price is the price of one unit on the bucket's last day, which is the price value already uses.

The lots read is skipped unless cost or paid is asked for, so worth, which asks for units and value alone, does not pay for it.

## What was slow

The profile of the invested case on `wide` over five years, before this change, was taken the same way as the profile above. The call took 285 ms under the profiler and 328 ms on the bench. The database was not the cost: the lots read took 9 ms for 531 moves, and the prices of the 118 days they were paid for took 2 ms. A CPU profile of ten calls put the time in application code.

| part                                                        | self time (ms) |
| ----------------------------------------------------------- | -------------: |
| garbage collection                                          |             44 |
| rolling 80 thousand holding rows up into the accounts above |             45 |
| turning the rolled rows into the measures asked for         |             20 |
| the day by day walk over holdings, units and prices         |             24 |
| valuing and adding up lots for each holding and day         |             24 |
| multiplying big numbers                                     |             10 |

The invested case across all history on `fifty-years` is a different shape: 113 ms under the profiler and 129 on the bench, with monthly buckets and so few rows. The lots read took 18 ms for 2682 moves, the prices of their 598 paid days 7 ms, and the rest was reading sixteen-byte amounts out of year buffers, walking prices and waiting for the database. After the change it takes 88 ms under the profiler and 101 on the bench, and the units read from the monthly deltas, at about 60 ms for fifty years of months, is now its longest part.

The rows are the cost. A holding of 44 over 1827 days is 80 thousand rows, and the accounts above them double it to 157 thousand. Splitting by commodity, which units asks for, is why the roll-up cannot add the commodities first. After the walk was gone, the same profile showed these places left.

- Building each holding's days one at a time read the gains of a day from an object by a string key, 1827 times for each holding, for 20 ms. A holding changes on few days, so the sum is now laid out once, from the opening, and filled in between the days it changes on.
- Multiplying units by the price took 8 ms, mostly on days when neither had changed. A day that has the units and the price of the day before keeps its value, and the multiplying fell to 4 ms.
- The roll-up looked up a table of tables of tables for each row and each account above it, made a closure for each lookup and added every measure whether it was asked for or not. It then built a second object for each row to drop the measures that were not asked for. The roll-up now keeps one array of rows for each account and commodity, indexed by bucket, finds the arrays once for each run of rows of one holding, and builds only the measures asked for, once. The first amount a total gets is kept, and is not added to nothing, which makes fewer large numbers for the garbage collector. Rolling up and measuring 157 thousand rows took 120 ms before and takes about 45 now.
- Reading the units over five years from the daily view added up every day in the database twice, once in the view for the inflow and outflow that units do not use, and again in the bucket. Reading the postings directly takes 22 ms where the view took 31, and the rows come back the same.

A closure-free roll-up alone changed nothing in the earlier attempt, and it still does not: the time was in the lookups and in building rows twice, not in the closures.

## Numbers

Means over ten samples on the same machine, before and after, in milliseconds. The full tables are in the benchmarks document.

| fixture      | case            | before | after |
| ------------ | --------------- | -----: | ----: |
| wide         | home worth 5y   |    168 |   131 |
| wide         | home worth all  |     29 |    25 |
| wide         | home worth year |     33 |    25 |
| fifty-years  | home worth all  |     82 |    74 |
| fifty-years  | home worth 5y   |     64 |    59 |
| twenty-years | home worth 5y   |     63 |    59 |
| twenty-years | home worth 10y  |     14 |    12 |

Holdings were not touched, since they ask for cost, and stay between 20 and 35 ms. The gain is smaller than the profile promised because most of what is left is shared. The rows must still be rolled up into the accounts above them, which takes 27 ms for 80 thousand rows on `wide`, building them takes 26 and the price of each commodity on each day 33. Reading units dropped out, and so did reading balance years: worth now works on a ledger whose year rows are missing.

Cost, price and paid then move the invested cases, which asked for paid and had kept the old walk. Means over ten samples, in milliseconds.

| fixture      | case                   | before | after |
| ------------ | ---------------------- | -----: | ----: |
| wide         | accounts invested 5y   |    327 |   146 |
| wide         | accounts invested year |     67 |    35 |
| wide         | accounts invested all  |     51 |    36 |
| wide         | home worth 5y          |    132 |   106 |
| fifty-years  | accounts invested 5y   |    138 |    79 |
| fifty-years  | accounts invested all  |    129 |   101 |
| fifty-years  | income invested all    |    127 |   102 |
| fifty-years  | home worth 5y          |     59 |    49 |
| twenty-years | accounts invested 5y   |    124 |    74 |
| twenty-years | accounts invested all  |     47 |    38 |

Every invested case is now under 150 ms on all three fixtures. Invested on `wide` over five years is the closest, at 146 ms with a 99th percentile of 167 ms. The rows it makes are what is left: 157 thousand for 44 holdings and 1827 days, about 25 ms to build and 45 ms to roll up. Worth over five years on `wide` gained from the faster roll-up, from 132 to 106 ms. What stays over 150 ms are reads that are not balances: the drops across all history, the returns and the bridge.

## Considered Options

- **Valuing in SQL with the rates query**: one query for every commodity and bucket end, no price code in the application. The rates query looks each pair up with an index scan, and 77 thousand pairs on `wide` took 890 ms. A month of pairs over fifty years took 46 ms, as much as the whole read today. The price year rows hold every day already and are read in one query.
- **Stored daily worth**: a table of what each account was worth each day. Reading it would be cheap, but every price change rewrites every day after it, and the value would go stale between a change and its rewrite.
- **Dropping the empty rows**: a holding at nothing before its first move would have no rows. It saves building rows, but the accounts above would then appear and vanish with their children, and every existing result would change.
- **A running sum in SQL**: a window over the monthly cache and the days. It keeps the sum out of application code, but the prices are in application code, so the sums would have to come back anyway and the gain is small.

## Consequences

- The balances read no longer reads the balance years. They remain for the drops and the bridge, which still walk days, until each moves onto the sum.
- A span of five years by date reads days from the daily view, which is bounded by its index. A span in months or years reads whole months from the cache.
- The home page of a ledger with a commodity that has no price now gets a failure from the balances read. The web treats any failure as a call that did not succeed, so it needs a decision on whether this failure is a warning like the returns ones.
- The rows a balances read returns are its remaining cost on wide ledgers. A read split by commodity over five years by date on 44 holdings is 157 thousand rows, and building and rolling them up is about 70 of the 146 ms.
- A cost in a commodity with no price on the day its lot was paid for is a failure of its own, and a cost with no price on a bucket's last day makes that holding's cost nothing and counts it as unpriced, as before.
- The lots are read by day, so a ledger with very many lots over five years reads one row for each day, account, commodity and cost commodity that moved. The read is bounded by the span's index, as the units read is.
- The opening reads were measured on the fifty years ledger, with 231 thousand postings and 2,682 lots, for its biggest holding (2,084 lots) and for every account. Unit openings do not read history of accounts that were not asked for: the account filter is pushed inside the union, and for that holding the read takes 0.7 ms and 131 buffers from two years before the end, against 13 ms and 1,370 buffers for every account. Cost openings do grow with history, since the planner joins the account's lots to a scan of every posting: 0.1 ms from 1977, 10 ms from 1990 and 15 ms from two years before the end, the same 15 to 17 ms for one account or all, against 5 to 6 ms when the hash join is switched off and the lots are read by index. The wide ledger, with 31 thousand postings, takes 3.6 ms. The cost and paid balances of that one holding for the last year take 25 ms on the fifty years ledger and 17 ms on the wide one, against 6 and 9 ms for units and value. The cost opening is under 20 ms, so no index or query change was made. If it grows past 20 ms, a join from the lots to their postings by index is the change to make. The disposals table is empty in these ledgers, so that half of the union was not measured.
- The partial index postings_account_id_date_other names the Indian rupee base in its predicate, so changing the base needs a migration.
