# Prices belong to symbols, and a ledger links its commodities to feeds

A ledger values its holdings at market prices, and writing a `P` line for every fund every day is not something anyone does by hand. A [feed](../../GLOSSARY.md), such as mfapi for Indian mutual funds or Yahoo for listed shares, reports those prices for a **symbol**: mfapi's `120716`, Yahoo's `HDFCNIFTY.NS`. A ledger links one of its commodities to a symbol with a `P` line that names one in place of a price:

```
P * HNFI mfapi:120716
P 2023-01-01 HNFI yahoo:HDFCNIFTY.NS
```

`*` links from the start, and a dated link replaces the one before it from that day, so a commodity has one feed on any day. Two links for one commodity on the same date, or a feed Rupee does not know, is a fault on its line. Currencies are ISO codes, so a quote in `USD` is the ledger's `USD` and a link never names what its feed quotes in.

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
- Yahoo's chart API is unofficial and may change or refuse requests, so a feed that fails is recorded on its symbol rather than failing a sync.
