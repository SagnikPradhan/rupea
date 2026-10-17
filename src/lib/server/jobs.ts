import type { Job } from '#services/jobs/application/jobs.ts';

/** Every job a server claims and a worker runs. */
export const jobs: Job<unknown>[] = [];
