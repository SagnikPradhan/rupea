# Prices belong to symbols, and a ledger links its commodities to feeds

A ledger values its holdings at market prices, and writing a `P` line for every fund every day is not something anyone does by hand. A [feed](../../GLOSSARY.md), such as mfapi for Indian mutual funds or Yahoo for listed shares, reports those prices for a **symbol**: mfapi's `120716`, Yahoo's `HDFCNIFTY.NS`. A ledger links one of its commodities to a symbol with a `P` line that names one in place of a price:

```
P * HNFI mfapi:120716
P 2023-01-01 HNFI yahoo:HDFCNIFTY.NS
```

`*` links from the start, and a dated link replaces the one before it from that day, so a commodity has one feed on any day, and a feed's quotes count only while it is linked. A feed Rupee does not know is a fault on its line. Two links for one commodity from the same day may sit in different files, so the ledger check reports them, naming both lines. Currencies are ISO codes, so a quote in `USD` is the ledger's `USD` and a link never names what its feed quotes in.

Every price belongs to a symbol. A symbol is a feed and its name for a commodity; a ledger's own commodities are symbols of the `ledger` feed, owned by that ledger, priced by its `P` lines and posting prices and rebuilt from its files on every sync. A feed's symbols, and the quotes fetched for them, are shared by every ledger, so ten thousand users holding one fund cost one fetch. A ledger's links are cached in `symbol_links` beside its other indexed rows. The price of a commodity on a day is the latest one on or before it across the ledger's own symbol and the symbol its link names that day, where a `P` line beats a posting price, and a posting price beats a quote.

## Considered Options

- **Links in a `commodity` directive with dash metadata**: room to grow, but a link is a statement about a commodity's price, which is what `P` already says.
- **Fetched prices written into the ledger's files**: they stay in the files and work in other tools, but decades of daily NAVs bury what the user wrote, and they can be fetched again.
- **A `quotes` table beside `prices`**: each table keeps one owner, but a price would then have two homes and every read two shapes.
- **Shared rows in `prices` with a nullable ledger**: one table, but a row's owner would depend on which of its columns are null.
- **Quotes kept per ledger**: one owner for every row, but every ledger holding a fund fetches it again, which a hosted service cannot afford against a rate-limited feed.

## Consequences

- `P date commodity feed:symbol` is not a price in ledger or hledger, so a file with a link no longer opens in them.
- A price no longer records its ledger; a ledger's own prices are reached through its symbols, by `(feed, ledger_id, symbol)` and then `(symbol_id, date)`.
- A ledger's symbols stay once made and go with the ledger, so a commodity whose prices left the files keeps an empty symbol.
- Yahoo's chart API is unofficial and may change or refuse requests, so a feed that fails is recorded on its symbol rather than failing a sync. It turns away requests without a browser's user agent. A documented feed with a key can sit behind the same `ListQuotes` port when hosting needs one.
- A `fetch-quotes` job fetches one symbol, partitioned and deduplicated on it, so ledgers sharing a symbol never fetch it at once. A sync queues it, as the ledger's owner, for each symbol the ledger links that has never been fetched; the first fetch backfills the whole history and each later one asks from the latest quote on, replacing that day's in case the feed corrected it. Keeping symbols fresh after that is left to a refresh and, later, a schedule.
- `symbol_fetches` holds when a symbol was last fetched, and since when its fetches have failed with what error. A feed that is down or busy (`FeedUnavailable`) is retried with the job's backoff; an unknown symbol or an answer Rupee cannot read is not.
- Yahoo quotes some exchanges in a currency's hundredth, such as `GBp` in London; these become the ISO currency, a hundredth the price, and a currency that is not ISO fails the fetch.
- The server reaches the internet through `fetch` in the context, so tests answer for a feed and never reach it.
