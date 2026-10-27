# Rupea

Rupea is a plain-text personal ledger. Bank, card and broker statements are imported into `.rupea` files, which stay the source of truth.

## Ledger

**Ledger**:
Everything one person or household records about their money, made up of ledger files.
_Avoid_: Book, journal

**Ledger file**:
A `.rupea` text file in a ledger; the files, not anything derived from them, are the truth.
_Avoid_: Journal file

**Transaction**:
A dated, described set of postings that balances to zero.
_Avoid_: Entry, record

**Posting**:
One line of a transaction moving an amount into or out of one account.
_Avoid_: Split, leg

**Account**:
A colon-separated name whose first segment is its account type. Each is a row of its own, under its parent, named as first written; any case of the name means the same account.

**Account tree**:
How charts and pickers divide accounts. An account with nothing posted to it and one account right under it is left out, and the one under it takes its place; a top account is always kept.
_Avoid_: Hierarchy, chart of accounts

**Account type**:
One of Assets, Liabilities, Income, Expenses or Equity; every account has exactly one.
_Avoid_: Root, prefix, category

**Commodity**:
What an amount is counted in: a currency, a share or a fund unit. An amount with none named is in rupees.
_Avoid_: Currency (one kind of commodity), asset, ticker (that is a symbol)

**Price**:
What a commodity is worth in another, per unit or in total: written on a posting, or as a `P` line for a market price. A transaction balances at its prices, each commodity on its own, except where a posting names a lot cost.
_Avoid_: Rate, cost basis (that is a lot cost)

**Feed**:
Somewhere Rupea fetches market prices from, such as mfapi for mutual funds or Yahoo for shares. A ledger is the feed of its own prices.
_Avoid_: Provider, source (that reports money movements)

**Symbol**:
What a feed calls a commodity, like `120716` on mfapi. Every price belongs to one; a ledger's own commodities are symbols of its own feed.
_Avoid_: Ticker, code

**Link**:
A `P` line naming a feed's symbol in place of a price, so a commodity is priced by that feed from its date, or from the start with `*`.
_Avoid_: Mapping, binding

**Alias**:
The commodity a link prices, as the ledger names it.
_Avoid_: Local symbol

**Quote**:
A price a feed reported for its symbol on a day, shared by every ledger that links to it.
_Avoid_: Fetched price, rate

**Balance account**:
An Assets or Liabilities account, where real money sits.
_Avoid_: Real account

**Net worth**:
What every balance account holds on a day, in rupees at the latest prices known by then: assets less what is owed. A holding with no price yet is left out and counted as unpriced.
_Avoid_: Equity (an account type), wealth

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

## Investments

**Lot**:
A batch of a commodity a balance account gained at one time, with what each unit cost. A buy's price is its cost.
_Avoid_: Tax lot, position, tranche

**Lot cost**:
The `{cost}` or `{cost, date}` a posting writes to name the lot it takes units from. A sale must name one; a transfer or gift may.
_Avoid_: Cost basis, book value

**Holding**:
Everything one account holds of one commodity, made up of its lots.
_Avoid_: Position, investment

**Disposal**:
Units taken out of a lot by a sale, a transfer, a gift or a buy covering a short. A sale's disposal has a gain; the others have none.
_Avoid_: Sale (only one kind), reduction, closing

**Sale**:
A posting taking units out of a holding against another commodity, balanced at its lot cost with the gain written beside it.
_Avoid_: Sell, redemption

**Transfer**:
A posting taking units out of a holding against the same commodity into another balance account; the lots move with their date and cost.
_Avoid_: Move

**Flow**:
Value moved into or out of an Assets account from outside it, as a deposit, a withdrawal or an opening balance, at what it was worth that day. Net investment income is not a flow. Short for external cash flow.
_Avoid_: Cash flow (also covers income), transfer (lots moving in kind), contribution

**Net in**:
What flowed into an account over a range, less what flowed out.
_Avoid_: Net invested (reads wrong on a bank), cost (open lots only)

**Net investment income**:
Interest and dividends an account receives, less the fees it pays: postings from `Income:Interest` or `Income:Dividends`, or to `Expenses:Fees`, and the accounts under them, whatever their names below that. It goes to the transaction's postings of commodities other than rupees, or to its rupee ones when it has none, split equally. It is part of the account's return, not a flow.
_Avoid_: Earnings (a company's profit), income (an account type), gain (a sale's)

**XIRR**:
An Assets account's money-weighted return: the yearly rate at which its value at the start of a range, its flows and its value at the end, each discounted from its own day, add up to zero. A range under a year shows the same return over its own length rather than per year.
_Avoid_: CAGR (ignores flows), time-weighted return, IRR (assumes evenly spaced flows)

## Storage and access

**Storage**:
The place one user's files live, such as a local directory or a Drive folder. It holds every ledger that user owns.
_Avoid_: Root, drive, bucket, vault

**Owner**:
The user whose storage a ledger lives in.

**Member**:
A user other than the owner who has been granted a ledger.
_Avoid_: Collaborator, guest

**Handle**:
A ledger's permanent name, used to address it.
_Avoid_: Slug, ID

## Importing

**Source**:
Anything that reports money movements: a bank or card statement, a broker report, an order export.
_Avoid_: Provider

**Statement**:
A file from a source, kept in the ledger it is imported into.

**Inbox**:
A ledger's statements that wait for a schema, as no ledger file cites them yet.
_Avoid_: Queue, pending, unfiled

**Schema**:
A description of one kind of statement: how to recognise it, how to read it into records, and the account they belong to. It belongs to a ledger.
_Avoid_: Template, parser

**Built-in schema**:
A schema Rupea ships for a common source, copied into a ledger the first time an import with it is saved.
_Avoid_: Template, default schema

**Pattern**:
One of a schema's `match:` entries, recognising a statement by text in it (`text:` or `regex:`) or by its name (`file:`).
_Avoid_: Matcher, rule

**Path**:
Where a schema reads one value of a record: locators to find the cell, then transforms to read it.
_Avoid_: Selector, mapping

**Locator**:
One step of a path towards a cell, by column (`header:`, `col:`), by content (`text:`, `regex:`) or by an offset (`left:`, `below:`).
_Avoid_: Selector

**Transform**:
One step of a path turning the text of a cell into a value, like `date:` or `number`.
_Avoid_: Filter, converter

**Draft**:
The ledger file an import produces from a statement, saved in the review area and fixed there before it counts.
_Avoid_: Preview

**Review area**:
The `_/` folder of a ledger's files, where uploads and drafts wait. The ledger counts nothing in it until a file is moved out.
_Avoid_: Staging, inbox

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

## Lists

**Period**:
What a page covers: a calendar month or year named like 2026-03 or 2026, all of history, or the days between two picked by hand. A past month or year is whole, and the current one runs to today. Spending, net worth and lists all use it.
_Avoid_: Range, calendar span, window

**Filter**:
What a list of transactions or postings is narrowed to: a period, an account with the accounts under it, and words in a description. It lives in the page's URL.
_Avoid_: Query (kept for a future query language), search

## Spending

**Spending**:
What Expenses accounts gained over a period, in rupees at the prices known by each posting's day, net of refunds and counting only counted transactions. An amount with no price yet is left out and counted as unpriced.
_Avoid_: Expenses (an account type), outflow, burn

**Bucket**:
The days a chart adds up into one bar: a day, a month or a year, set by the period.
_Avoid_: Interval, bin, period

## Background work

**Job**:
A piece of work Rupea does for a user outside a request, like reading a statement they uploaded. Its user can see whether it is waiting, running, done or failed, and why.
_Avoid_: Task, queue item, message

**Partition**:
The jobs of one name that run one at a time, like the statements one user uploaded. A job names its partition with a key, its user's by default.
_Avoid_: Queue, lane, group

**Orchestrator**:
The part of the server that claims due jobs, dispatches each to a worker and settles how it ended: succeeded, retried or failed. A claim holds a lease the orchestrator renews until the job settles; a claim whose lease runs out is released, since its worker died.
_Avoid_: Scheduler, supervisor, dispatcher

**Worker**:
A child process of the server that runs the jobs the server claims, one at a time. Every replica runs up to `RUPEA_JOBS_WORKERS` of them, and one left idle for a while exits.
_Avoid_: Consumer, runner
