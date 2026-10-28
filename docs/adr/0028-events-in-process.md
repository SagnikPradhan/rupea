# Events run in process, for now

A service announces what it did by publishing an event: a past-tense name, like `files-changed`, and a valibot payload. Other services subscribe to it, and publishing runs every subscriber in the publisher's process, as the user it names. A subscriber's failure does not stop the others, and the publisher gets back what failed. Events are not stored, so a subscriber whose work must outlive the process, or is slow, queues a job ([ADR 0010](0010-background-jobs.md)) rather than doing the work itself. A subscription never is a job: the job runs the same whoever queued it.

`src/lib/server/server.ts` lists every job, every subscription and every loop the server runs outside requests, and `startServer` starts them, kills them on a dev reload and stops them on shutdown. A loop that stops before shutdown is logged and started again after a delay that doubles up to a minute. The first loop watches the users' folders of each storage kind and publishes `files-changed` once a quarter second for each user whose files changed, with every key that did, so a checkout of many files queues one `sync-ledger` for each ledger it touched.

Local storage watches with chokidar rather than Node's recursive `fs.watch`, which on Linux misses most replaces of a file it has reported before, and a replace is how editors and Rupea save one.

An event published as the process stops is lost before its subscriber queues anything. For changes to storage that is acceptable, since a resync covers whatever a watcher missed ([ADR 0026](0026-sync-on-triggers-not-reads.md)). Events that must not be lost will need delivery through the jobs table, which this shape leaves room for.

## Considered Options

- **Every subscriber a queued job**: durable and run in a worker, but it costs a row and a worker for each reaction, and the one subscriber so far only queues a job anyway.
- **An events table that subscribers read**: replays and fans out on its own, but it is a second queue beside jobs, with its own claiming, retries and cleanup.
