import { attemptResult, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { ClaimedJob } from '../adapters/database';
import { findJob, readPayload, type Job } from '../domain/jobs';
import { asJob } from './jobs';

/** Runs a claimed job's own code, as the user who queued it. */
export const runJob = (l: Job<unknown>[], c: ClaimedJob): ResultAsync<void> =>
	asJob(c, () =>
		findJob(l, c.name).asyncAndThen((j) =>
			readPayload(j, c).asyncAndThen((p) => attemptResult(() => j.run(p, c.userId))),
		),
	);
