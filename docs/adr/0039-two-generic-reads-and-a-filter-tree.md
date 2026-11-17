# Two generic reads, and a filter tree for the postings they count

Every report of the ledger is one of two reads ([ADR 0038](0038-one-balances-read.md)). The deltas read says what accounts gained in each bucket, and the balances read says what they held at the end of each. Spending, income, liabilities and the daily average are the first read over different accounts. Worth, holdings and invested are the second. Bridge, drops and returns will compose these two with one pure function each, and no read treats Expenses, Income or Assets as a special case.

The deltas read gains an optional filter. A filter is plain data, a tree of `all`, `any`, `not`, `account` and `counter`, with no syntax, so a query language can produce it later and nothing else has to change. An `account` test passes the postings on that account and every account under it, in any case. A `counter` test holds when the same transaction has a posting on another account that passes a test on accounts. The tree lives in the domain, and the database adapter compiles it to where clauses with every name and id bound as a parameter.

The counter test is how returns tell flows from moves. For each Assets account, a delta that came from or went to something that is not another asset is a flow in or out of the portfolio, and a transfer between two Assets accounts is neither. That is a counter test on not Assets. The investment-income split is the same test against Income. A counter is on another account, so a transaction that posts twice to one account does not count itself.

## Where a counter test reads

The monthly delta cache holds one row per account, commodity and month, so it has no transactions in it. A filter of account tests alone is a test on the account column, so it stays on the cache and costs what an unfiltered read costs. A filter with a counter test reads postings joined by transaction instead, in SQL, through the index on a posting's transaction. Nothing is loaded into application code. On fifty-years, Assets by year for the whole history takes 52 ms unfiltered, 92 ms against not Assets (every posting of the ledger is in range, so the database scans them) and 34 ms against Income. A counter read over a short span uses the indexes and reads little.

## Profile

The benchmark cases named spending all in earlier notes are the expenses deltas and expenses daily reads for the whole history. On fifty-years they took about 42 ms and 86 ms. A profile with EXPLAIN (ANALYZE, BUFFERS) and a clock around the adapter and the whole call split the time like this.

| part                                          | expenses deltas all | expenses daily all |
| --------------------------------------------- | ------------------: | -----------------: |
| whole application call                        |             43.9 ms |            87.2 ms |
| account tree, problems and first day          |              4.2 ms |             4.3 ms |
| adapter call                                  |             33.4 ms |            52.1 ms |
| left for application code after the other two |              6.3 ms |            30.8 ms |
| database time for the one query (EXPLAIN)     |             34.0 ms |            51.3 ms |

Most of each read is the database, and it is not an indexed lookup that went wrong. The monthly cache holds 24 thousand rows for these accounts, which the query reads and groups by year, and the daily read has to add up the 110 thousand base-currency postings of the accounts because a day of the month is not in the cache. The two cheap wins were these.

- The same query also looked for amounts held in a commodity other than the base. It found none, but it scanned every posting of the ledger in parallel to find that out, about 9 ms, because no index served a test on not the base. A partial index on account and date for counted postings in another commodity answers it from a few pages. It names the base currency, which is rupees everywhere in the server today.
- The daily average counted, for each of 31 days, how many months of the span hold that day, with date arithmetic on each of 600 months, about 30 ms. It now walks the months once and adds the days each month has inside the span.

## Numbers

Means over ten samples on the same machine, before and after, in milliseconds. The full tables are in the benchmarks document.

| fixture      | case                | before | after |
| ------------ | ------------------- | -----: | ----: |
| fifty-years  | expenses deltas all |     42 |    32 |
| fifty-years  | expenses daily all  |     86 |    54 |
| fifty-years  | income deltas all   |    6.3 |   4.9 |
| fifty-years  | home worth all      |     83 |    82 |
| twenty-years | expenses deltas all |     24 |    16 |
| twenty-years | expenses daily all  |     67 |    49 |
| wide         | expenses deltas all |     47 |    44 |
| wide         | expenses daily all  |     80 |    71 |

## Considered Options

- **A rollup table of flows**: it would make returns fast, but every read under 150 ms so far is an indexed query, and a table to keep in step comes only when a profile shows an indexed query cannot do it.
- **A counter column on each posting, set at sync**: one cheap test, but the answer depends on the other postings, so it would be rewritten whenever a transaction is edited, and it fixes one question into the schema.
- **Compile an expression string instead of a tree**: a parser is later work, and a tree is what it would produce anyway.

## Consequences

- The deltas read behaves as before when it has no filter, and the web does not send one yet.
- A filter with a counter test cannot use the monthly cache, so a read of many years with a counter test reads the postings of its accounts. The profile above puts that at about 90 ms for the whole history on fifty-years.
- The partial index adds a little to every write of a posting in another commodity, and it must change if the base currency ever does.
