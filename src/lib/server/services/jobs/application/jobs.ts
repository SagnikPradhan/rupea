import { provide, withContext } from '#lib/server/shared/context/context.ts';
import { type ResultAsync } from '#lib/server/shared/result/result.ts';
import { findJobs, insertJob, type ClaimedJob, type UserJob } from '../adapters/database';
import { dedupeOf, partitionOf, type Job } from '../domain/jobs';

export { findJobs };
export type { ClaimedJob, Job, UserJob };

type EnqueueOptions<P> = {
	job: Job<P>;
	user: string;
	payload: P;
};

/** Queues a job to run as `user`; inside `atomically`, only once the transaction commits. */
export const enqueue = <P>(o: EnqueueOptions<P>): ResultAsync<void> =>
	insertJob({
		userId: o.user,
		name: o.job.name,
		version: o.job.version,
		payload: o.payload,
		partition: partitionOf(o.job, o.payload, o.user),
		dedupe: dedupeOf(o.job, o.payload),
	});

/** Logs as the job, with its name, id and attempt. */
export const asJob = <T>(c: ClaimedJob, f: () => T): T =>
	withContext()((context) => {
		const logger = context.logger.child({ job: c.name, job_id: c.id, attempt: c.attempts });
		return provide({ ...context, logger }, f);
	});
