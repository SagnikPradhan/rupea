# Architecture

How work runs outside a request, and the internal terms for it. [GLOSSARY.md](../GLOSSARY.md) has the domain terms users see, and the [ADRs](adr) say why things are this way.

`src/lib/server/server.ts` lists every job, subscription and loop, and `startServer` starts them.

## Terms

**Event**: something a service announces it did, named in the past tense, with a valibot payload. `files-changed` says keys in a user's storage may have changed. Events are not stored, so one published as the process stops is lost ([ADR 0028](adr/0028-events-in-process.md)).

**Subscription**: what runs when an event is published, in the publisher's process and as the user the event names. One failing does not stop the others. Work that is slow or must outlive the process queues a job instead of running here.

**Loop**: work the server does until it stops, outside any request or job. One that stops early is logged and started again, after a delay that doubles up to a minute.

**Job**: work a service runs outside a request, in a worker process. Jobs are rows in the database, so they survive a restart. A failed job is tried again, and a job may run more than once, so running it again must be harmless. A partition makes jobs run one at a time, and a dedupe key stops a second copy being queued ([ADR 0010](adr/0010-background-jobs.md)).

## Choosing one

- A request needs the answer: call the application function.
- Other services should react to something: publish an event.
- The work is slow, or must not be lost: queue a job.
- The work never ends, like watching a folder: run a loop.

## A file changes

All four meet when a file changes, whoever changed it ([ADR 0026](adr/0026-sync-on-triggers-not-reads.md)):

1. The `publishChanges` loop watches each kind of storage, and publishes `files-changed` for each user whose files changed, at most once every quarter second.
2. The `syncChanged` subscription works out which ledgers those files belong to, and queues `sync-ledger` for each.
3. A worker runs the `sync-ledger` job. Its partition and dedupe key are the ledger, so one ledger syncs one at a time, and changes made while a sync waits join it.
4. The job brings the ledger's index up to date with its files. Requests only read that index.
