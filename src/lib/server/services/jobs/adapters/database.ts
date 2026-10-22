import { attemptWrite, violates } from '#lib/server/db/errors.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { json, noneOf } from '#lib/server/db/expressions.ts';
import type { Tables } from '#lib/server/db/tables.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import type { RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql, type Expression, type ExpressionBuilder } from 'kysely';
import { JobStatus } from '../domain/jobs';

const DAY = 24 * 60 * 60 * 1000;
const UNKNOWN_KEPT = DAY;
const SUCCEEDED_KEPT = 7 * DAY;
const FAILED_KEPT = 30 * DAY;

type NewJob = {
	userId: string;
	name: string;
	version: number;
	payload: unknown;
	partition: string;
	dedupe: string;
};

/** Queues a job unless a copy waits. */
export const createJob = (j: NewJob): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.insertInto('jobs')
				.values({ ...j, payload: json(j.payload) })
				.onConflict((o) =>
					o
						.columns(['userId', 'name', 'dedupe'])
						.where('status', '=', JobStatus.Queued)
						.doNothing(),
				)
				.execute();
		}),
	);

export type UserJob = {
	id: string;
	status: JobStatus;
	payload: unknown;
	error: RupeeError | null;
	createdAt: Date;
};

type ListJobsOptions = {
	userId: string;
	name: string;
	/** Fields the payload holds, such as the ledger it ran in. */
	payload: Record<string, string>;
	limit: number;
};

/** A user's latest jobs of one name, newest first. */
export const listJobs = (o: ListJobsOptions): ResultAsync<UserJob[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('jobs')
				.select(['id', 'status', 'payload', 'error', 'createdAt'])
				.where('userId', '=', o.userId)
				.where('name', '=', o.name)
				.where('payload', '@>', json(o.payload))
				.orderBy('createdAt', 'desc')
				.limit(o.limit)
				.execute(),
		),
	);

export type ClaimedJob = {
	id: string;
	userId: string;
	name: string;
	version: number;
	payload: unknown;
	attempts: number;
};

type Known = { name: string; version: number };

/**
 * Runs the job due first that we know, in a partition with none running. A claim that raced
 * another to the same partition breaks `jobs_name_partition_running`, and tries again past it.
 */
export const claimJob = (known: Known[], lease: number): ResultAsync<ClaimedJob | null> => {
	if (known.length === 0) return okAsync(null);

	return claimDue(known, lease).orElse((e) =>
		violates(e, 'jobs_name_partition_running') ? claimJob(known, lease) : errAsync(e),
	);
};

export type Run = { id: string; name: string; attempts: number };

const ofThisAttempt = (r: Run) => (e: ExpressionBuilder<Tables, 'jobs'>) =>
	e.and([e('id', '=', r.id), e('attempts', '=', r.attempts), e('status', '=', JobStatus.Running)]);

export const renewLease = (r: Run, lease: number): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.updateTable('jobs')
				.set({ leasedUntil: later(lease) })
				.where(ofThisAttempt(r))
				.execute();
		}),
	);

export const finishJob = (r: Run, error: RupeeError | null): ResultAsync<void> => {
	const status = error ? JobStatus.Failed : JobStatus.Succeeded;
	return updateRun(r, { status, error });
};

/**
 * Queues a run again after `delay`, or deletes it when a copy was queued while it ran. The requeue
 * runs in a savepoint, since the copy's unique violation aborts the transaction it happens in.
 */
export const retryJob = (r: Run, error: RupeeError, delay: number): ResultAsync<void> => {
	const queued = { status: JobStatus.Queued, error, runAt: later(delay) };
	return atomically(() => updateRun(r, queued)).orElse((e) =>
		violates(e, 'jobs_user_id_name_dedupe_queued') ? deleteRun(r) : errAsync(e),
	);
};

export const listExpired = (limit: number): ResultAsync<Run[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('jobs')
				.select(['id', 'name', 'attempts'])
				.where('status', '=', JobStatus.Running)
				.where('leasedUntil', '<=', now)
				.limit(limit)
				.execute(),
		),
	);

/** Fails the jobs that waited a day under a name no server knows, and deletes old ones. */
export const sweep = (l: string[]): ResultAsync<void> => failUnknown(l).andThen(deleteFinished);

const failUnknown = (known: string[]): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.updateTable('jobs')
				.set((e) => ({
					status: JobStatus.Failed,
					error: sql<RupeeError>`jsonb_build_object('type', 'JobUnknown', 'name', ${e.ref('name')})`,
				}))
				.where('status', '=', JobStatus.Queued)
				.where('runAt', '<=', ago(UNKNOWN_KEPT))
				.where((e) => noneOf(e.ref('name'), known, 'text'))
				.execute();
		}),
	);

const deleteFinished = (): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.deleteFrom('jobs')
				.where((e) =>
					e.or([
						e.and([
							e('status', '=', JobStatus.Succeeded),
							e('updatedAt', '<=', ago(SUCCEEDED_KEPT)),
						]),
						e.and([e('status', '=', JobStatus.Failed), e('updatedAt', '<=', ago(FAILED_KEPT))]),
					]),
				)
				.execute();
		}),
	);

const now = sql<Date>`now()`;
const later = (t: number) => sql<Date>`now() + make_interval(secs => ${t / 1000})`;
const ago = (t: number) => sql<Date>`now() - make_interval(secs => ${t / 1000})`;

const claimed = ['id', 'userId', 'name', 'version', 'payload', 'attempts'] as const;

const claimDue = (known: Known[], lease: number) =>
	withContext('db')((db) => {
		const next = db
			.selectFrom('jobs')
			.select('id')
			.where(due(known))
			.where((e) =>
				e.not(
					e.exists(
						e
							.selectFrom('jobs as running')
							.select('running.id')
							.whereRef('running.name', '=', 'jobs.name')
							.whereRef('running.partition', '=', 'jobs.partition')
							.where('running.status', '=', JobStatus.Running),
					),
				),
			)
			.orderBy('runAt')
			.orderBy('id')
			.limit(1)
			.forUpdate()
			.skipLocked();
		return attemptWrite(() =>
			db
				.updateTable('jobs')
				.set((e) => ({
					status: JobStatus.Running,
					attempts: e('attempts', '+', 1),
					leasedUntil: later(lease),
				}))
				.where('id', 'in', next)
				.returning(claimed)
				.executeTakeFirst()
				.then((c) => c ?? null),
		);
	});

const due = (known: Known[]) => (e: ExpressionBuilder<Tables, 'jobs'>) =>
	e.and([
		e('status', '=', JobStatus.Queued),
		e('runAt', '<=', now),
		e.or(known.map((k) => e.and([e('name', '=', k.name), e('version', '<=', k.version)]))),
	]);

type RunUpdate = { status: JobStatus; error: RupeeError | null; runAt?: Expression<Date> };

const updateRun = (r: Run, e: RunUpdate): ResultAsync<void> =>
	withContext('db')((db) =>
		attemptWrite(async () => {
			await db
				.updateTable('jobs')
				.set({ ...e, error: e.error && json(e.error), leasedUntil: null })
				.where(ofThisAttempt(r))
				.execute();
		}),
	);

const deleteRun = (r: Run): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.deleteFrom('jobs').where(ofThisAttempt(r)).execute();
		}),
	);
