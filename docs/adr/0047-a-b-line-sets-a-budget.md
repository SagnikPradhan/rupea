# A B line sets a budget

A budget is a limit on what an account and everything under it may spend in a period. It is written in the ledger's files, so it is plain text, versioned with the rest and the same on a hosted service and an embedded one, as account terms are ([ADR 0034](0034-an-a-line-sets-up-an-account.md)). It has its own letter by the rules in [ADR 0046](0046-a-directive-is-a-letter-for-one-kind-of-thing.md).

```
B * Expenses:Food
- limit: 15000
- period: month

B 2027-04-01 Expenses:Food
- limit: 18000

B * Expenses:Travel
- limit: 120000
- period: year
- start: 2026-04-01
```

`*` sets the budget from the start and a date sets it from that day. A later line overrides only the keys it names, so the second line above leaves `period` alone. Of two lines for one day, the later written wins. The ledger check reports two `*` lines for one account, naming both. Accounts match whatever their case.

## Keys

- `limit`: the amount for one period, in the ledger's base currency. It is required.
- `period`: `month` or `year`, `month` when left out. A year is the calendar year.
- `start`: a date. Periods run from it, one `period` at a time. Left out, a month starts on the 1st and a year on 1 January. `period: year` with `start: 2026-04-01` is the Indian financial year, and a month with `start: 2026-04-25` runs from the 25th to the 24th. A dated line that names `start` cuts the periods there.

The parser keeps keys as written, as ADR 0002 reserves none, and the app types them. A line that does not fit says nothing and shows the account with no budget, as an `A` line does. A bad `limit`, `period` or `start` is reported as a problem on its line.

## What a budget covers

A budget covers its account and everything under it. A budget on a child account is a sub-limit within its parent's, not an addition to it, so a total of budgets sums only those with no budgeted ancestor and never counts a posting twice. A refund counts back against the limit.

Spent is the sum of the account's counted postings between the period's first and last day. It is read from the generic delta read ([ADR 0039](0039-two-generic-reads-and-a-filter-tree.md)) and bounded by the period, with no special case for expenses, so a budget on an Income or Assets account reads the same way. The first page that shows one is Expenses, and every period shows its dates.

Terms are indexed one row for each `B` line with its keys as JSON, as `account_terms` is, so a line with no keys is still found.

## Considered Options

- **A `~ monthly` periodic entry**: see [ADR 0046](0046-a-directive-is-a-letter-for-one-kind-of-thing.md).
- **Keys on the account's `A` line**: no new parser, but a card's `limit` and a budget's would clash.
- **`every` for the period and `year` as the financial year**: `every` suggests a schedule, which repeating payments will want, and a calendar year is what the word says.
- **A table of budgets, edited in the app**: easy to build, but the ledger would no longer say everything about itself.

## Consequences

- `hledger` stops on a file with a `B` line. See ADR 0046.
- Budgets that tighten when you stay under them are not built. Any key they need is free, since no key is reserved. They would count from the date of the line that names them, so a `*` line never reaches back over a whole ledger.
- Nothing ends a budget yet. Deleting the line drops past months from view. A later `- limit: none` is the likely way to end one.
- A form on the Expenses page writes and edits the account's `*` line in place, keeps comments and keys it does not know, and shows the line it wrote.
- A financial-year view is a `start` the form can write for you, and no special value.
