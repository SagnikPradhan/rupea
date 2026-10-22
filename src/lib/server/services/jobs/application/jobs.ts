import { provide, withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { dedupeOf, findJob, partitionOf, readPayload, type Job } from '../domain/jobs';

export type { ClaimedJob, UserJob } from '../adapters/database';
export type { Job };

type EnqueueOptions<P> = {
	job: Job<P>;
	user: string;
	payload: P;
};

/** Queues a job to run as `user`; inside `atomically`, only once the transaction commits. */
export const enqueue = <P>({ job, user, payload }: EnqueueOptions<P>): ResultAsync<void> =>
	DB.createJob({
		userId: user,
		name: job.name,
		version: job.version,
		payload,
		partition: partitionOf(job, payload, user),
		dedupe: dedupeOf(job, payload),
	});

/** Runs a claimed job's own code, as the user who queued it. */
export const runJob = (jobs: Job<unknown>[], claimed: DB.ClaimedJob): ResultAsync<void> =>
	asJob(claimed, () =>
		findJob(jobs, claimed.name).asyncAndThen((j) =>
			readPayload(j, claimed).asyncAndThen((p) =>
				attempt(() => j.run(p, claimed.userId)).andThen((r) => r),
			),
		),
	);

export const listJobs = DB.listJobs;

/** Logs as the job, with its name, id and attempt. */
export const asJob = <T>(c: DB.ClaimedJob, f: () => T): T =>
	withContext()((context) => {
		const logger = context.logger.child({ job: c.name, job_id: c.id, attempt: c.attempts });
		return provide({ ...context, logger }, f);
	});
