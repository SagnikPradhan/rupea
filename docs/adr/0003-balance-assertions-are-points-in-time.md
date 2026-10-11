# A balance assertion is a point in time on its account

A statement prints a running balance after every row, and an import writes it as `= balance` on the statement account's posting. An assertion is a point in time on the account, checked against every counted posting before it in any file. Within a file, postings are a sequence and are ordered by line. Across files on the same day, a posting is ordered against the assertion only when both have a time. Otherwise it is **unordered**, and the assertion is reported as ambiguous instead of being checked; adding a time on either side settles it.

An event's money moves at its primary. A statement row that is evidence moves nothing, so if its primary sits in another file on the same day, the row's neighbours need times to check cleanly.

Assertion problems are warnings. They say the ledger and the statement disagree, not that any file is broken, so they never block a save or hide a transaction.

## Considered Options

- **One global order by file name, then line** (as hledger does): whether a statement's own balances pass would depend on what its files are called.
- **Each assertion sees only its own file that day**: always checkable, but the point in time then depends on which file is asking, and a same-day duplicate in another file goes unnoticed until the next day.
- **Assertions only at the start of a day** (as Beancount does): no ambiguity, but it throws away the per-row balances statements print, which is what catches a single missing or duplicated row.

## Consequences

- An unordered posting from another file always makes the assertion ambiguous, even when every possible order would pass. This is strict on purpose: it points straight at the posting that needs a time, or at a duplicate nobody has linked.
- Checks run over every posting of each asserted account on every sync. If this gets slow, the fix is to keep daily opening balances in the index, not to change the rule.
