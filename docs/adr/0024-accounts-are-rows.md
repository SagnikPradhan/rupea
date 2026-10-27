# Accounts are rows

An [account](../../GLOSSARY.md) is a row in `accounts`, with its type and its parent, and postings, monthly deltas and lots point at it by `account_id`. Indexing a file adds the accounts its postings name, and their parents, before it inserts the postings; settling deletes the accounts nothing is posted under any longer. The first spelling indexed names the account, and a name written in another case finds the same row through a unique index on `lower(name)`.

The server draws the [account tree](../../GLOSSARY.md) from these rows, so charts and pickers divide accounts the same way: an account with nothing posted to it and one account right under it is left out, and the one under it takes its place. Net worth is split into parts in SQL from a list of account ids and the part each counts towards, which the tree works out.

## Considered Options

- **Account names on every row**: charts and pickers had to split names by colons in the browser, each in its own way, and every query matched names by prefix and case.
- **An accounts table beside the names**: the tree has one home, but every row still repeats the name, and the two can disagree.

## Consequences

- Rewriting migration 0007 means a database that ran the old one has to be reset.
- Listing an account and checking its balances no longer tell two spellings of one account apart.
