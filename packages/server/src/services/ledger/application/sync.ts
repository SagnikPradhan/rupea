import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import type { Batch } from '#lib/server/shared/result/batch.ts';
import type { RupeaError } from '@rupea/shared/error.ts';
import { ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Entry, Storage } from '#lib/server/shared/storage/storage.ts';
import { enqueue, listJobs, type JobStatus } from '#services/jobs/application/jobs.ts';
import * as DB from '../adapters/database';
import { plan } from '../domain/sync';
import type { Ledger } from '../domain/types';
import { syncLedger as syncJob } from './jobs';
import { openFolder } from './ledger';
import { addProblems, checkLedger, embed, queueFetches } from './sync-after';
import { indexEach, listLedgerFiles, type ReindexOptions } from './sync-index';
import { settle, settleAll } from './sync-settle';

/**
 * What is wrong with the ledger: the problems sync kept, and what checking the
 * ledger finds.
 */
export const listProblems = (l: Ledger): ResultAsync<Batch<never>> =>
	DB.listProblems(l.id).andThen((p) =>
		checkLedger(l).map((e) => ({ succeeded: [], failed: [...p, ...e] })),
	);

/** Queues a sync, for when a change to the ledger's files went unnoticed. */
export const sync = (l: Ledger): ResultAsync<void> =>
	enqueue({ job: syncJob, user: l.owner, payload: { ledger: l.handle } });

/**
 * Queues a sync that reads every file again and rebuilds all that is worked out
 * from them, for when the index itself is in doubt.
 */
export const resync = (l: Ledger): ResultAsync<void> =>
	enqueue({ job: syncJob, user: l.owner, payload: { ledger: l.handle, full: true } });

/** How the ledger's latest sync went, or null before its first. */
export const findSync = (l: Ledger): ResultAsync<JobStatus | null> =>
	listJobs({
		userId: l.owner,
		name: syncJob.name,
		payload: { ledger: l.handle },
		limit: 1,
	}).map((j) => j[0]?.status ?? null);

/**
 * Brings the index up to date without checking the ledger, which costs a pass
 * over every group.
 */
export const syncIndex = (l: Ledger): ResultAsync<RupeaError[]> => syncWith(l, update);

/**
 * Syncs the index as a job does, logging what failed, since nobody waits for
 * its answer.
 */
export const syncLedger = (l: Ledger): ResultAsync<void> => logged(syncIndex(l));

/** Syncs as resync asks, logging what failed as syncLedger does. */
export const resyncLedger = (l: Ledger): ResultAsync<void> => logged(syncWith(l, rebuild));

/**
 * Brings the index up to date with these files as the ledger's only writer,
 * then settles what they touched. A ledger indexed before the year tables gets
 * them first, so a change never leaves it with only some.
 */
export const reindex = (o: ReindexOptions): ResultAsync<RupeaError[]> =>
	exclusively(o.ledgerId, () => DB.saveMissingYears(o.ledgerId).andThen(() => indexAndSettle(o)));

type SyncStep = (s: Storage, id: string, stored: Entry[]) => ResultAsync<RupeaError[]>;

const syncWith = (ledger: Ledger, step: SyncStep): ResultAsync<RupeaError[]> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		exclusively(ledger.id, () => listLedgerFiles(s).andThen((f) => step(s, ledger.id, f)))
			.orElse((e) => ok([e]))
			.andThen((f) => addProblems(ledger, f))
			.andThen((f) => queueFetches(ledger, f))
			.andThen((f) => embed(ledger, f)),
	);

const logged = (synced: ResultAsync<RupeaError[]>): ResultAsync<void> =>
	withContext('logger')((l) =>
		synced
			.andTee((f) => (f.length > 0 ? l.info({ failed: f }, 'synced with failures') : null))
			.map(() => undefined),
	);

/**
 * Runs `f` in one transaction as the ledger's only writer, so what it indexes
 * is settled with it or not at all.
 */
const exclusively = <T>(id: string, f: () => ResultAsync<T>): ResultAsync<T> =>
	atomically(() => DB.lockLedger(id).andThen(f));

const indexAndSettle = (o: ReindexOptions): ResultAsync<RupeaError[]> =>
	indexEach(o).andThen((i) => settle({ ledgerId: o.ledgerId, indexed: i }));

// Storage is listed under the lock, so a file a writer indexed meanwhile is
// listed too and never taken for gone. Most syncs find nothing changed, and
// then nothing needs settling. A settle that fails undoes what this sync
// indexed, so the next one tries again.
const update = (s: Storage, id: string, stored: Entry[]): ResultAsync<RupeaError[]> =>
	DB.saveMissingYears(id)
		.andThen(() => DB.listIndexedFiles(id))
		.andThen((indexed) => {
			const p = plan(stored, indexed);
			return p.changed.length + p.gone.length === 0
				? okAsync([])
				: indexAndSettle({ ledgerId: id, storage: s, ...p });
		});

/**
 * Reads every file again whether or not it changed, then settles all the
 * ledger, since what reading a file did not touch may be what is wrong.
 */
const rebuild = (s: Storage, id: string, stored: Entry[]): ResultAsync<RupeaError[]> =>
	DB.listIndexedFiles(id)
		.andThen((indexed) =>
			indexEach({
				ledgerId: id,
				storage: s,
				changed: stored.map((f) => f.key),
				gone: plan(stored, indexed).gone,
				full: true,
			}),
		)
		.andThen((i) => settleAll(id).map(() => i.failed));
