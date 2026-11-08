# An A line sets up an account, and the ledger stays the source of truth

A loan has a rate and an EMI, and a card has a limit and a due day. None of this is a posting, but all of it is a fact about an account that the user knows and the ledger cannot work out. It belongs in the ledger files, as prices do ([ADR 0017](0017-prices-belong-to-symbols-and-a-ledger-links-commodities-to-feeds.md)), so it is plain text, versioned with the rest, and works the same on a hosted service and an embedded one. An `A` line names an account and carries its terms as dash lines ([ADR 0002](0002-metadata-is-a-dash-line-attached-to-the-nearest-line-above.md)):

```
A * Liabilities:Loans:Home
- kind: loan
- rate: 8.5
- payment: 42000
- due: 5
```

`*` sets the account up from the start, and a date does so from that day. An `A` line can name any account, not only a liability. The server folds an account's lines up to a day into its terms: a later line overrides only the keys it names, and of two lines for one day the later written wins. This is how a limit or a rate will change over time; the form writes only `*` lines for now. Accounts match whatever their case. Two `A` lines for one account from the same day may sit in different files, so the ledger check reports them, naming both lines, and the form refuses to save an account with two `*` lines.

The parser keeps the keys as written, because ADR 0002 reserves none. The app types them by `kind`: a loan has `rate` (a year), `payment` (the EMI), `due` (a day of the month), `method` (`reducing`, the default, or `flat`) and `tenure` (months, for flat loans). A card has `limit`, `statement` and `due` days, and `rate`. Lines that do not fit their kind say nothing, and the account shows as a plain row. There is no `principal`: a loan from before the ledger starts comes in through an opening balance, so the ledger's balance is what is owed.

Terms are indexed in `account_terms`, one row for each `A` line with its keys as JSON, so a line with no keys still counts as set up and a repeat can be found by account and day. The page reads them folded by the server for today, with one query and never a posting; the server also types them, so the page only reads the result, and the form is checked against the same types before it saves.

The Liabilities page sets an account up through a form in plain words. It writes the line into `main.rupea`, made on the first save, or edits the account's `*` line in place when another file already holds it, keeping its comments and the keys the form does not know. The file is written only if it is unchanged since it was read and only if it reads back as meant, as a transaction is.

## Considered Options

- **A table of settings, edited in the app**: easy to build, but the ledger would no longer say everything about itself, and the terms would be lost when the files moved to another tool or user.
- **Metadata on the account's first posting**: no new syntax, but there is no one posting to hold it, and an account with no postings yet could not be set up.
- **An `account` directive, as in Ledger and hledger**: familiar, but those tools declare accounts there and would reject Rupea's keys. `A` pairs with `P` and stays short.
- **One row for each key in the index**: simple to query, but a line with no keys would vanish and a repeat would need counting lines in SQL.

## Consequences

- `A` lines are not valid in ledger or hledger, so a file with one no longer opens in them, as with a link.
- Indexed files are read again once, as the indexer version goes up.
- Interest in each payment, the end of a loan and the debt-free date are worked out from these terms in a later change, and are shown as estimates.
- A form write prints the whole file, so a file that is not already in the printer's layout is tidied the first time the form writes to it.
