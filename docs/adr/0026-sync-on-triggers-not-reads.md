# Sync on triggers, not on reads

A ledger's files can change outside Rupea: edited on disk, or in Drive or OneDrive once those are built. Reads used to sync first, so every page took the ledger lock, listed every file and could reindex, queue fetches and embed before it answered. Now a storage reports which keys changed, and each report starts a sync of that ledger as a job. Reads only read the index.

A sync is one operation. It lists the ledger's files and reads again every file whose version differs from the one it indexed, or that an older Rupea indexed. A user who thinks a change was missed asks for a sync; that runs the same thing, not a rebuild.

## Considered Options

- **Sync before each read**: what we had. A page made several syncs, each waiting its turn for the lock, and reads wrote the index.
- **Sync on each page navigation**: still lists every file far more often than anything changes.
- **A cursor of changes in the application**: Drive and OneDrive work this way, but the cursor is theirs. Their adapters keep it, and hand the application changed keys like any other storage.
- **Reindex the whole ledger on every change**: costs as much as all of history each time an editor saves.

## Consequences

- A version is opaque. Local storage makes it from the nanosecond modified time and the size, so listing reads no content. A tool that writes new content of the same size and restores the old modified time, like `rsync --times`, goes unseen until the file changes again.
- A change made while nothing listens, such as when the server is down, is caught only by the next sync of that ledger.
- Rupea's own writes trigger a sync too. It finds the versions it indexed and reads nothing.
