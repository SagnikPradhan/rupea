# Reports read deltas generically, and other services reach the ledger through one file

Spending, income, holdings and worth had each grown a read of their own, and each treated its account type as special. A ledger is signed amounts per account and day, so one read serves them all: the **deltas** of any set of accounts over a span, grouped into a bucket and valued in a base currency. The account filter, the span, the bucket and the base are arguments. They are not new queries, and nothing in the read knows whether an account is Expenses, Income or Assets. Showing expenses as positive is presentation.

`deltasBetween` is the shared read of the caches. Whole months come from `monthly_deltas` and the edge days from `daily_deltas`, so a span of any length reads at most two partial months of days. Holdings, balance checks, the year rewrite and `listDeltas` all use it. `listDeltas` takes account ids, which the application resolves once from the account tree with `idsUnder`, and not names that each query matches again. Posting-level reads stay posting-level where the rule needs it: `listFlows` splits net investment income by the price each posting names.

Valuation is one recursive CTE, `ratesOf`, that takes the base as a parameter. A posting already in the base skips conversion. There is no limit on the hops a price may take, and a path never returns to a commodity it has been through, so prices that go round end. The ledger will hold its base currency, so nothing in the adapters names rupees. The domain still compares against `DEFAULT_COMMODITY` and takes the ledger's base when the setting exists.

"Delta" is the word because the tables already say it, and the glossary avoids Move for a transfer. `worth.ts` keeps its own `Move`, which is a different thing.

Other services do not import a ledger's domain or adapters. The ledger publishes the plain-text language that extraction and refinement need, such as amounts, the printer, account types and group roles, from `application/language.ts`, and ESLint rejects any other import of the ledger's domain or adapters from outside it. The server's wiring, each service's schema file, and scripts are exempt. A foreign key to a ledger is declared with `ledgerColumn()`, so no service names the `ledgers` table.

On the bench, the mean over `twenty-years` for all of history fell from 398 ms to 79 ms, on `fifty-years` from 796 ms to 179 ms, and on `wide` from 280 ms to 101 ms. A year fell from 31 ms to 10 ms, 24 ms to 7 ms and 32 ms to 20 ms. The day-of-month calendar needs daily rows and stays near 170, 270 and 100 ms.

## Considered Options

- **A read for each account type**: it fits the pages as they were, but every new view or base currency adds a copy, and the copies drift.
- **Valuing in the deltas table**: values are stored once, but they go stale on every price change and fix the base currency in the cache.
- **Moving the plain-text language into a shared kernel**: no service depends on the ledger for it, but the parser reaches into lots, and untangling that is its own change. The public file shows what a kernel would hold.

## Consequences

- Returns and the cost behind the accounts table still read postings or lots of their own. `listFlows` repeats the join onto the rates that `listDeltas` writes. A helper over both would need generics that read worse than five repeated lines.
- A base currency on the ledger replaces `DEFAULT_COMMODITY` in `worth.ts`, `cost.ts`, `holdings.ts`, `lots.ts` and the accounts application. The adapters already take it.
- A span of all history starts on the first day the accounts had a delta, which the application finds first with `findFirstDelta`.
- The domain's spending names, `Spending` and the endpoints, are now `Deltas`, `listDeltas` and `listDailyDeltas`, and the pages still say spending.
