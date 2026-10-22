# Service functions: names and shapes

A newcomer should guess what a service function does, and how to call it, from its name alone. So every function across the services follows one vocabulary and one shape, and the same thing keeps one name from the database to the page.

**One verb per kind of work.**

| verb                         | means                                                          |
| ---------------------------- | -------------------------------------------------------------- |
| `find`                       | looks up one row or a few in the database; may come back empty |
| `list`                       | many rows, or a page of them                                   |
| `read`                       | content from storage, such as a file or a statement            |
| `create`                     | a new record, such as a ledger, user or job                    |
| `save`, `delete`, `rename`   | change what is there                                           |
| `open`                       | acquires a handle to work through, such as a folder or a PDF   |
| `sync`, `recount`, `rebook`… | domain work with its own name                                  |

`get` is not used: it says nothing about where the data comes from. An endpoint is named after the application function it calls, so `listFiles` in `files.remote.ts` calls `Files.listFiles`, and the page imports `listFiles` too.

**Application functions take the ledger, or one options object.** A function that needs only the ledger takes it alone: `listFiles(ledger)`. Anything more goes in one object, destructured in the parameter list: `readFile({ ledger, key })`. No positional pairs, which read the same at the call site whichever way round they are.

**Adapters are plain functions.** An adapter exports functions that take what they work on first, such as `DB.findLedger(userId, handle)` or `Stored.read(storage, ledgerId, key)`, not factory objects that close over it. The application imports an adapter as a namespace, so `DB.listPostings` and `Transactions.listPostings` can share a name without clashing. A port with several implementations, such as `Storage` or `Models`, stays a named type.

**A database adapter is split by table.** A query lives with the table whose rows it returns: `database-transactions.ts`, `database-postings.ts`, `database-lots.ts` and so on, gathered by a `database.ts` barrel. No module knows the whole schema.

**Lists that report problems return a `Batch`.** A read that syncs first, or reads many files, returns `Batch<T>` with what it read and what went wrong, and its endpoint replies with `replyFromBatch`. Anything else replies with `replyFrom`.

## Considered Options

- **Factory objects** (`index(ledgerId).transactions()`): fewer arguments at each call, but a second way to name the same thing, and a 25-method facade nobody could take in at once.
- **Positional arguments everywhere**: shorter, but `renameEvent(ledger, 'a', 'b')` does not say which name is which.
- **One database adapter per service**: one place to look, until it holds 1,400 lines.

## Consequences

- Endpoints, application functions and adapters line up by name: following a request means following one word down.
- Endpoints refresh the queries a command changes inline, rather than through a shared helper, so each command reads top to bottom.
- Views for the pages live in `endpoints/views.ts`; the domain keeps printing ledger text only.
