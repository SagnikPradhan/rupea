# One balances read replaces the per-view account reads

The contract had a read for each view: `listDeltas`, `listHoldings`, `listInvested` and `listWorth`, with the daily average split off as `listDailyDeltas` ([ADR 0033](0033-one-delta-read-and-a-public-ledger-surface.md)). They all answer one question, what the accounts held or moved per bucket, in different clothes. They are now one read, `listBalances`, modelled on the balance reports of hledger and beancount.

The input is the handle, `from`, `to`, an optional account and bucket (`date`, `day`, `month` or `year`), and what to show:

- `accumulate` is `change` (the default) or `historical`, like hledger's `--historical`. Change sums what moved inside each bucket. Historical carries everything from before `from` and reports the balance at each bucket's end.
- `aggregate` is `sum` (the default) or `average`. Average applies only to bucket `day`, and gives the daily average that `listDailyDeltas` gave.
- `measures` default to `['value']`. The others are `inflow`, `outflow`, `units`, `cost`, `paid` and `price`.

The output is `from`, `to`, the `base` commodity once, and rows of `account`, `commodity` (or null), `bucket` and `unpriced`, plus the measures asked for. Amounts are plain strings. `unpriced` counts the holdings in that row with no price. A row splits by commodity only when `units` or `price` is asked, since a sum across commodities is only meaningful in value.

`cost` is the cost basis valued at each bucket's end prices, as hledger and beancount do, so a gain is price movement alone. `paid` is the rupees actually paid, each lot at the rate of its purchase day, and stays so the invested chart keeps its numbers.

The web picks the bucket. Short spans use `date`. Net worth uses `month` once the span passes 366 days, and a daily chart stays daily up to a year and monthly beyond.

Combinations that make no sense are rejected by a check in the contract: historical needs an ending bucket (`date`, not `day`) and no `inflow` or `outflow`, and change allows no `units`, `cost`, `paid` or `price`. Application code never imports the contract, so the check lives only there.

## Considered Options

- **Keep a read for each view**: each is simple alone, but every new view adds an endpoint and the copies drift, as ADR 0033 found.
- **Open a query language now**: the user wants a BQL-like language eventually, but not yet. One read with measures and buckets makes the later step a new front for the same read, with no loss of speed in the meantime.

## Consequences

- Mention drops, `listDrops`, `findBridge` and `listReturns`, are not covered. A later decision will fold them in or leave them apart.
