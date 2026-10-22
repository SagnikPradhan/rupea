import { attemptWrite, violates } from '#lib/server/db/errors.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import type { RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, desc, eq, inArray, lte, notExists, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { jobs } from './database-schema';
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
				.insert(jobs)
				.values(j)
				.onConflictDoNothing({
					target: [jobs.userId, jobs.name, jobs.dedupe],
					where: sql`${jobs.status} = 'queued'`,
				});
		}),
	);

export type UserJob = {
	id: string;
	status: JobStatus;
	payload: unknown;
	error: RupeeError | null;
	createdAt: Date;
};

export type ListJobsOptions = {
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
				.select({
					id: jobs.id,
					status: jobs.status,
					payload: jobs.payload,
					error: jobs.error,
					createdAt: jobs.createdAt,
				})
				.from(jobs)
				.where(
					and(
						eq(jobs.userId, o.userId),
						eq(jobs.name, o.name),
						sql`${jobs.payload} @> ${JSON.stringify(o.payload)}::jsonb`,
					),
				)
				.orderBy(desc(jobs.createdAt))
				.limit(o.limit),
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

const ofThisAttempt = (r: Run) =>
	and(eq(jobs.id, r.id), eq(jobs.attempts, r.attempts), eq(jobs.status, JobStatus.Running));

export const renewLease = (r: Run, lease: number): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db
				.update(jobs)
				.set({ leasedUntil: later(lease) })
				.where(ofThisAttempt(r));
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
				.select({ id: jobs.id, name: jobs.name, attempts: jobs.attempts })
				.from(jobs)
				.where(and(eq(jobs.status, JobStatus.Running), lte(jobs.leasedUntil, sql`now()`)))
				.limit(limit),
		),
	);

/** Fails the jobs that waited a day under a name no server knows, and deletes old ones. */
export const sweep = (l: string[]): ResultAsync<void> => failUnknown(l).andThen(deleteFinished);

const failUnknown = (known: string[]): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const error = sql`jsonb_build_object('type', 'JobUnknown', 'name', ${jobs.name})`;
			await db
				.update(jobs)
				.set({ status: JobStatus.Failed, error })
				.where(
					and(
						eq(jobs.status, JobStatus.Queued),
						lte(jobs.runAt, ago(UNKNOWN_KEPT)),
						notInArray(jobs.name, known),
					),
				);
		}),
	);

const deleteFinished = (): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			const old = or(
				and(eq(jobs.status, JobStatus.Succeeded), lte(jobs.updatedAt, ago(SUCCEEDED_KEPT))),
				and(eq(jobs.status, JobStatus.Failed), lte(jobs.updatedAt, ago(FAILED_KEPT))),
			);
			await db.delete(jobs).where(old);
		}),
	);

const later = (t: number) => sql`now() + make_interval(secs => ${t / 1000})`;
const ago = (t: number) => sql`now() - make_interval(secs => ${t / 1000})`;

const claimed = {
	id: jobs.id,
	userId: jobs.userId,
	name: jobs.name,
	version: jobs.version,
	payload: jobs.payload,
	attempts: jobs.attempts,
};

const claimDue = (known: Known[], lease: number) =>
	withContext('db')((db) => {
		const running = alias(jobs, 'running');
		const busy = db
			.select({ id: running.id })
			.from(running)
			.where(
				and(
					eq(running.name, jobs.name),
					eq(running.partition, jobs.partition),
					eq(running.status, JobStatus.Running),
				),
			);
		const next = db
			.select({ id: jobs.id })
			.from(jobs)
			.where(and(due(known), notExists(busy)))
			.orderBy(jobs.runAt, jobs.id)
			.limit(1)
			.for('update', { skipLocked: true });
		const claim = {
			status: JobStatus.Running,
			attempts: sql`${jobs.attempts} + 1`,
			leasedUntil: later(lease),
		};
		return attemptWrite(() =>
			db
				.update(jobs)
				.set(claim)
				.where(inArray(jobs.id, next))
				.returning(claimed)
				.then(([c]) => c ?? null),
		);
	});

const due = (known: Known[]) =>
	and(
		eq(jobs.status, JobStatus.Queued),
		lte(jobs.runAt, sql`now()`),
		or(...known.map((k) => and(eq(jobs.name, k.name), lte(jobs.version, k.version)))),
	);

type RunUpdate = { status: JobStatus; error: RupeeError | null; runAt?: SQL };

const updateRun = (r: Run, e: RunUpdate): ResultAsync<void> =>
	withContext('db')((db) =>
		attemptWrite(async () => {
			await db
				.update(jobs)
				.set({ ...e, leasedUntil: null })
				.where(ofThisAttempt(r));
		}),
	);

const deleteRun = (r: Run): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(async () => {
			await db.delete(jobs).where(ofThisAttempt(r));
		}),
	);
