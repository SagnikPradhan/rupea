# Net worth multiplies year rows on read

Working out net worth in SQL took a price lookup for every day of every holding, which cost 172 ms for a year and 11 s for ten over 20 years of history. Hiding that behind weekly or monthly points would hide dips, and a chart of someone's money should not.

`balance_years` holds one row per account, commodity and year the holding moved in, with its balance on each day of that year. `price_years` holds one row per symbol, quote commodity and year, with the price that won each day, or none. Both keep their days as 16-byte little-endian integers in a `bytea`, since a `numeric(38,0)` needs 127 bits and 8 bytes stop at ₹92 crore in ten-billionths. Prices belong to symbols, not ledgers ([ADR 0017](0017-prices-belong-to-symbols.md)), so a quote is written once however many ledgers link it, and each read walks the conversions itself.

The read fetches the years a span covers, the last balance row before it, and each commodity's price on the day before, then multiplies in `domain/worth.ts`. A year with no row carries on from the last day of the row before. Spans of up to 1,000 days show every day. Longer ones show each stretch's lowest and highest day, plus the first and last, so a one-day dip stays visible and the response keeps its shape.

Balances are cumulative, so an edit rewrites its holdings from the edited year on, in the transaction that settles it, and nothing reports a stale chart ([ADR 0022](0022-history-before-a-range-from-monthly-deltas.md) rejected this for all accounts and every day as rows; a year's bytes are one row, and only balance accounts have them). Price rows are not cumulative, so a price rewrites its one year. A symbol has rows for all its priced years or none, so its first write builds them all. Symbols are shared across ledgers, so a writer holds an advisory lock on each symbol it rewrites until commit. Each settle also rewrites every year the twelve checked months fall in, so a year left wrong by a bug is put right as the check comes round.

The sync button reads every file again and settles the whole ledger: counted flags, lots, months, years and balance checks, for when the index itself is in doubt. Any other sync builds what a ledger indexed before these tables lacks, and until then its chart is empty. There is no backfill job.

On a copy of the fixture ledgers, against the SQL it replaces, every compared point matched: 15,454 over 20 years and 15,586 over 50, across all accounts.

| Over 20 years of history | Before    | After |
| ------------------------ | --------- | ----- |
| A year of net worth      | 172 ms    | 13 ms |
| 3.6 years                | 1,596 ms  | 24 ms |
| 10 years                 | 11,388 ms | 52 ms |
| 20 years                 | not run   | 93 ms |

All of 50 years takes about 220 ms. The `wide` fixture, with many more holdings, takes about 142 ms for any span from 10 years up. Rebuilding every year takes 411 ms over 20 years and 976 ms over 50.

Writes pay for this. Over 50 years, saving an edit to the newest file went from 83 ms to 92 ms, to the oldest from 97 ms to 222 ms, and importing 100 transactions from 41 ms to 52 ms. On `wide` they went from 51 ms to 64 ms, 56 ms to 87 ms and 55 ms to 68 ms. A sync that finds nothing changed gains 1 to 3 ms.

## Considered Options

- **Weekly or monthly points**: fewer rows to work out, but a dip between points vanishes.
- **Storing worth per day**: no multiplying on read, but every price change rewrites every ledger holding that commodity, and every account view needs its own series.
- **Rows per day**: plain SQL, but as many rows as days times holdings, and an old edit rewrites all of them.
- **Offsets rather than balances**: an old edit touches one year, but each read sums every year before it.
- **8-byte amounts**: half the size, but too small for amounts a ledger can hold.
- **Forward-filled price rows**: no carrying on read, but a quote would rewrite every later year, in every ledger using the symbol.
- **Per-ledger rupee rates**: no conversions on read, but a shared quote then fans out to each ledger.
- **A background job for rewrites**: a faster sync, but a chart that is wrong until it runs.

## Consequences

- The price walk in `domain/worth.ts` and `priceOn` in SQL must agree, since holdings still use the second. A test holds them together.
- Every step that changes prices or balances must rewrite their years, or the chart is wrong until the check or the button reaches them.
- All time over 50 years, and long spans of a ledger with many holdings, miss the 100 ms goal.
- `monthly_deltas` still builds openings and serves other reads; a follow-up removes it, which must first account for assertions on accounts outside the balance types.
- Returns and spending still work from SQL and stay slow over long spans.
