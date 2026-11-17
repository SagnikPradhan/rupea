# Drops compose the balances read

[ADR 0042](0042-returns-compose-the-two-reads.md) left drops as the last report that walks every day of its span in application code. Drops now make one balances read and hand its result to a pure function in the drops module. The walk, the years of balances it read and the cost moves query that picked its holdings are gone. Every drops case is under the gate of 150 milliseconds on twenty-years, fifty-years and wide, and drops over the whole history on fifty-years went from 269 to about 88 milliseconds.

## The composition

- A query lists the accounts and commodities that have lots up to the end of the span: `select distinct account_id, commodity from lots where ledger_id = ? and date <= ?`. These are the holdings that count. The old rule, a cost on some day of the span, is gone, and a holding bought in a span is counted from its first lot.
- One balances read by date, of those accounts, exactly, with the units and price measures, over the span, asking for a series. The read takes a span of any length, since drops over the whole history need every day. The refusal of a span over 1827 days by date lives in the endpoint that pages call, not in the read, and counts from the first day with data when the span starts at the beginning.
- A pure function takes the series and the holdings. For each holding, the price move of a day is its units at the end of the day before, valued at that day's price, less the same units valued at the day before's price. What was put in or taken out never enters. The depth below the running high, the lows, the swings and the choice of shown days are as before.

The balances read gained two things for this and nothing else changed for its other callers. It takes a list of accounts, where it took one, and each name brings its accounts below it, unless the read is exact, when it reads each name alone. Drops read exactly the accounts that have lots, so an account below one with lots that has none is neither read nor reported as unpriced. With no holding that has lots, drops answer at once with nothing and read no more. Reading units and price no longer calls the lots read and no longer values each holding, since drops do not ask for the value, the cost or the amount paid. A read can also ask for a series: the units and price of each holding on every day as floats, in a field beside the rows, and no rows. Every other caller gets the rows it got before, exactly.

## Money rows stay exact, the series are floats

Rows are exact amounts for every caller, and no total or balance goes through a float. The series a read can give beside its rows are floats, since a depth or a swing is shown to a few digits and a float holds fifteen. The units of a series are summed as exact amounts and turned into a float once for each run of days, and a price is turned once for each run of days that share a rate. The depths and swings are within 1e-12 of those of exact amounts.

One rule follows from floats. Two days whose depths differ by float noise are one low, and the earliest of the days within 1e-12 of the lowest wins, as an exact answer would have chosen the earliest of two equal days. A flat stretch at the lowest price therefore puts the low on its first day. A trial on the broker account of fifty-years put its low on the first day of a flat stretch, where an exact comparison picked a later day. This is a change of behaviour on purpose and is tested.

## Rates read exactly from the stored prices

The price of each commodity on each day used to be built date by date through the price lookup. It is now decoded from the stored price years: sixteen bytes a day, with the days that have no quote skipped, carried forward from the opening price, limited to the windows of the links, and reaching rupees in at most two quotes with the rounding that multiplication does. A quote already in rupees needs no multiplying, since an amount times one is itself. A day that is asked for sparsely still uses the lookup. Every row of every caller is exactly what it was, checked on the three fixtures for date, month and year buckets before and after. This also speeds up the home worth, holdings, invested and bridge reads over many days.

## Why the first build was slow

The first build of this composition made one exact row for each holding on each day, about 470 thousand on fifty-years, three times over: a delta, a balance row, and a pair of floats in the pure function. It took 235 milliseconds on fifty-years over the whole history. The processor profile of 200 calls showed the cost in making those objects and in the garbage collection after them, and not in the arithmetic. The rates came to 66 milliseconds, mostly the multiplication of each day's quote by the rate of its currency, which is a multiplication by one for most days. Asking for a series skips the deltas, the rows and the conversion of rows into floats, and the rates no longer multiply by one.

Before, in milliseconds of processor time for each call on fifty-years over the whole history, from a timing of each stage: the rates from the price years 66, closing each holding on each day 26, rolling the deltas up into rows 49, the pure function with its conversion of rows 42, and the keys of the days 9, in a call of 213. After, the whole call is 77. What is left is spread thin: reading the stored price years 8, the collection of garbage 8, the decoding and chaining of rates about 12, and the conversion of rates into prices 4.

## Numbers

Means over ten samples on the same machine, in milliseconds, with the 99th percentile after. The full tables are in the benchmarks document.

| fixture      | case        | before | after | 99th after |
| ------------ | ----------- | -----: | ----: | ---------: |
| fifty-years  | drops all   |    269 |    88 |        105 |
| fifty-years  | drops 10y   |     75 |    21 |         24 |
| fifty-years  | drops 5y    |     51 |    14 |         16 |
| fifty-years  | drops year  |     31 |     8 |         10 |
| fifty-years  | drops month |     26 |     6 |          8 |
| wide         | drops all   |    174 |    56 |         64 |
| wide         | drops 10y   |    178 |    56 |         65 |
| wide         | drops 5y    |    104 |    33 |         40 |
| wide         | drops year  |     28 |    14 |         16 |
| wide         | drops month |     18 |    12 |         14 |
| twenty-years | drops all   |    116 |    35 |         41 |
| twenty-years | drops 10y   |     68 |    21 |         23 |
| twenty-years | drops 5y    |     42 |    13 |         16 |
| twenty-years | drops year  |     20 |     6 |          7 |
| twenty-years | drops month |     19 |     6 |          7 |

## What was tried and dropped

- **Aggregation in SQL.** Summing the units and the price moves in the database and sending one row for each day took 431, 1049 and 696 milliseconds on fifty-years, wide and twenty-years, slower than the walk.
- **A sparse read.** Reading only the days a holding moved on took 118, 284 and 185 milliseconds on the same fixtures and misses the gate on two of three.
- **A table of balances by day.** It would make the read an indexed range, and adds a table and its upkeep. It is not needed for the gate.
- **Exact rows alone, with the rollup into parent accounts left out.** About 213 milliseconds on fifty-years over the whole history, which was the first build.

## What is left

- The returns, bridge and home reads still make rows for each holding on each day. They could ask for a series too.
- The year balances table is read by no report. Dropping it is a decision of its own.

## Consequences

- An account that is not in the ledger fails with an account not found, as every other balances read does.
- The failures are those of the balances read: the problems of the ledger, and a holding with no price.
- A ledger with no balance years shows its drops at once.
- The old walk of every day, the cost moves read and the balance years read are gone. The old rates function that builds each day by lookup stays, as the check of the new one in tests.
