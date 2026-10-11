# Rupee

A plain-text personal ledger. Statements from many sources are imported into ledger files, and the same real money movement is often seen by more than one source.

## Ledger

**Ledger**:
Everything one person or household records about their money, made up of ledger files.
_Avoid_: Book, journal

**Ledger file**:
A `.rupee` text file in a ledger; the files, not anything derived from them, are the truth.
_Avoid_: Journal file

**Transaction**:
A dated, described set of postings that balances to zero.
_Avoid_: Entry, record

**Posting**:
One line of a transaction moving an amount into or out of one account.
_Avoid_: Split, leg

**Account**:
A colon-separated name whose first segment is its account type.

**Account type**:
One of Assets, Liabilities, Income, Expenses or Equity; every account has exactly one.
_Avoid_: Root, prefix, category

**Commodity**:
What an amount is counted in: a currency, a share or a fund unit. An amount with none named is in rupees.
_Avoid_: Currency (one kind of commodity), asset, symbol

**Price**:
What a posting in one commodity cost in another, per unit or in total. A transaction balances at its prices, each commodity on its own.
_Avoid_: Rate, cost basis (that belongs to lots, which are not modelled yet)

**Balance account**:
An Assets or Liabilities account, where real money sits.
_Avoid_: Real account

**Balance assertion**:
A posting's claim of what its account holds at that point in time, counting everything before it in any file. A file is ordered by line; other files on the same day only by time.
_Avoid_: Balance check, closing balance

**Unordered posting**:
A posting in another file on the same day as a balance assertion, where one of the two has no time, so it could fall on either side.

**Category**:
An Income or Expenses account, describing what money was for rather than where it is.

**Metadata**:
A `key: value` fact attached to a ledger file, transaction or posting. Any key is allowed; the system acts only on keys it understands.
_Avoid_: Tag (a tag is one kind of metadata value), annotation, attribute

## Importing

**Source**:
Anything that reports money movements: a bank or card statement, a broker report, an order export.
_Avoid_: Provider, feed

**Statement**:
A file from a source that is imported into the ledger.

**Schema**:
A description of how to read one kind of statement into records.
_Avoid_: Template, parser

**Draft**:
The ledger file an import produces, reviewed and edited before it is saved.
_Avoid_: Preview

## Events

**Event**:
One real money movement, seen as a group of transactions from different sources that share an event ID.
_Avoid_: Duplicate group, merge, cluster

**Primary**:
The one member of an event whose postings count.
_Avoid_: Canonical, master

**Evidence**:
A member of an event that is kept but not counted.
_Avoid_: Duplicate, copy, shadow

**Duplicate**:
Not a separate concept: a re-imported transaction is evidence in an event whose members share a description.

**Refinement**:
The step that finds candidates among saved transactions and proposes events as a reviewable diff.
_Avoid_: Dedup, reconciliation

**Candidate**:
Two transactions refinement suggests might be one event.
_Avoid_: Match (before it is accepted)

**Broken event**:
An event whose members contradict each other, such as no primary or two primaries.
