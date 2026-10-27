# Lists page by keyset and filter in the database

The transactions and postings lists no longer load a ledger to show it. Each page is one indexed query, newest first, that starts just past the last row of the page before: a keyset of the transaction's date, its time (midnight when it has none) and its id, plus the posting's position on the postings list. The browser asks for the next page as the reader nears the end of those fetched, and draws only the rows on screen with [TanStack Virtual](https://tanstack.com/virtual) (MIT), its rows spaced within the shared ledger table.

Filtering happens in the same query. A [filter](../../GLOSSARY.md) is a period cut short at the viewer's today, an account prefix and words in the description, held in the page's URL so a list can be shared and the back button works; the place in the list is not, so a reload starts at the top. An account matches itself and the accounts under it, whatever their case. A description matches any part of it through a `pg_trgm` index, since statement descriptions are codes like `UPI/AMZN*1234` rather than prose.

Whether a transaction counts is stored on it. Settling a change to the ledger's files works out which events' evidence is uncounted and writes only the rows that change, so a list reads a column rather than every event on each request. The issues across a ledger, from indexing to balance assertions, are their own query, which also brings the index up to date before a list reads it.

## Considered Options

- **TanStack Table**: holds sorting, filtering and paging state, but does that work on rows in the browser, which a decades-long ledger cannot afford, and does not fit a table that groups a transaction's postings under it.
- **Numbered pages with an offset**: a reader can jump to a page, but deep pages get slower and shift whenever a file changes.
- **A month per page**: matches how statements arrive, but a busy month is still unbounded and a quiet year is many empty pages.
- **Working out what counts on each request**: no stored state to keep right, but every page would read every event.
- **Full-text search or the description embeddings**: suit prose and similarity, not finding part of a bank's code.

## Consequences

- The order is fixed, newest first; sorting by another column would need its own keyset and index.
- The cursor is not in the URL, so a link opens a list at its top.
- Saving a file settles every event it touches, in any file, since a primary can move between them.
- The browser's find only reaches rows on screen.
- Holdings and net worth read the stored column too. Settling still works out the uncounted transactions itself, since it is what stores them.
