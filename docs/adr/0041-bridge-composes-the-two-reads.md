# The bridge composes the two reads

[ADR 0039](0039-two-generic-reads-and-a-filter-tree.md) said bridge, drops and returns would each compose the balances read and the deltas read with one pure function. The bridge was the first to do it. It had walked every day of the span in application code, as the balances read did before [ADR 0040](0040-worth-is-a-running-sum-of-deltas.md), and it read the income and expenses totals through a private helper.

## Profile

The whole call on the home page's bridge for all history was timed, then each part alone, means over ten runs, in milliseconds.

| part                                        | fifty-years | wide |
| ------------------------------------------- | ----------: | ---: |
| whole call                                  |         139 |   88 |
| account tree and problems                   |         0.7 |  1.8 |
| laying out the balances day by day          |        16.7 |  9.2 |
| worth on the first and last day             |         3.6 |  1.8 |
| price move of each group, found by the walk |        72.6 |   28 |
| income deltas for the span                  |         5.0 |  6.2 |
| expenses deltas for the span                |        36.1 |   41 |

Application code was about 95 of the 139 milliseconds on fifty-years. The price move alone took 73, because it rebuilds the price of every commodity on every day of fifty years to find where a holding's units change. The database part is the expenses read at 36, which scans the monthly cache of every expenses account, and the small income read.

## The composition

The bridge is now two reads and a pure function, and no read treats a part of the ledger as special.

- The balances read for the whole span, by year, says when anything was first held (the read's first day) and what each account held at the end of the last bucket, valued at the prices of the last day.
- The balances read for that first day alone says what each account held then.
- The deltas read for every account, by year, from the day after the first day to the last day, says what accounts gained. Income and Expenses give the totals, and each group of balances gives what it gained. It is left out when the span is one day.

The pure function takes the three sets of rows. Income is minus what Income gained, and expenses is what Expenses gained. The price move of a group, the account directly under Assets or Liabilities, is what its balance changed by over the span beyond what it gained, so a purchase at a price is not a price move and the move after it is. A group where that is nothing is left out, and what the income, expenses and groups do not explain stays as other, so the parts still add up to the change.

The two reads run one after the other, and the second pair runs together. Nothing else is read, so the bridge needs no balance years, no price years and no walk, and the day by day walk is now used only by drops and returns. The old price move function, the worth on one day function and their tests are gone.

## What changed in the answer

- The old price move counted a commodity only from the first day it had a price. A holding with no price when it came in, such as a gift, and priced later, had no price move and its whole value fell into other. It is now a price move, as the group gained nothing and its balance grew.
- A ledger with no balance years used to show no bridge until a sync built them. It now shows the bridge at once. The test that said so now says that the bridge does not need them.
- A posting made directly on Assets or Liabilities, not on an account under them, has no group, so it is part of other.
- The bridge now reports the failures of the balances read, such as a holding with no price, besides the ledger's problems.

## Numbers

Means over ten samples on the same machine, before and after, in milliseconds. The 99th percentile of the case that matters most, home bridge all on fifty-years, went from 157 to 117. The full tables are in the benchmarks document.

| fixture      | case              | before | after |
| ------------ | ----------------- | -----: | ----: |
| fifty-years  | home bridge all   |    149 |   112 |
| fifty-years  | home bridge 10y   |     39 |    39 |
| fifty-years  | home bridge 5y    |     29 |    30 |
| fifty-years  | home bridge year  |     17 |    23 |
| fifty-years  | home bridge month |     16 |    19 |
| wide         | home bridge all   |     92 |    73 |
| wide         | home bridge 10y   |     92 |    72 |
| wide         | home bridge 5y    |     66 |    55 |
| wide         | home bridge year  |     37 |    38 |
| wide         | home bridge month |     31 |    31 |
| twenty-years | home bridge all   |     58 |    51 |
| twenty-years | home bridge 10y   |     36 |    34 |
| twenty-years | home bridge 5y    |     27 |    26 |
| twenty-years | home bridge year  |     17 |    20 |
| twenty-years | home bridge month |     14 |    16 |

The short spans cost a few milliseconds more, as three small reads replace one walk of a few days. Every case is under 150.

## Considered Options

- **Keep the walk for the price move only**: it is the part that took 73 milliseconds, and it needs the same price rebuild the balances read no longer does.
- **Read the price move from lots with the paid measure**: it would miss a holding with no lots, such as a foreign currency in cash, which the deltas read values as it is posted.
- **Add a field to the balances rows for the price move**: not needed, since the balance and the gain of each group are already rows of the two reads.

## Consequences

- The deltas read for every account by year is now the longest part of the bridge on fifty-years, at about 80 of its 112 milliseconds, because it scans the monthly cache of all accounts. A filter of the four roots would not shrink that, and the next saving is in that read for everyone who uses it.
- Drops and returns still walk days, and are the next to move.
