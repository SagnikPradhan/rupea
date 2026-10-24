import { provide, withContext, type RupeeContext } from '#lib/server/shared/context/context.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { batchAsync } from '#lib/server/shared/result/batch.ts';
import { unknownError, type RupeeError } from '#lib/server/shared/result/error.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import {
	claimJob,
	listExpired,
	finishJob,
	renewLease,
	retryJob,
	sweep,
	type ClaimedJob,
	type Run,
} from '../adapters/database';
import { processes, type Dispatch } from '../adapters/processes';
import { endingOf, findJob, timeoutOf, type Ending, type Job } from '../domain/jobs';
import { asJob } from './jobs';

const LEASE = 120_000;
const RENEW_EVERY = 30_000;
const RELEASE_EVERY = 30_000;
const POLL_EVERY = 1_000;
const SWEEP_EVERY = 60 * 60 * 1000;
const RELEASED_AT_ONCE = 100;

/** Under the 30 seconds Kubernetes and others give before killing the server. */
const GRACE = 20_000;

const ABANDONED = unknownError('the worker stopped before the job finished');

type StartOptions = {
	/** The worker module, the flags Node needs to run it, and the variables it reads. */
	entry: string;
	execArgv: string[];
	env: Record<string, string>;
	context: RupeeContext;
	jobs: Job<unknown>[];
	/** Settles once the workers' models are ready; nothing is claimed before. */
	ready: Promise<void>;
};

/** Orchestrates jobs here and runs each in one of up to `jobs.workers` processes. */
export const startWorkers = (o: StartOptions) => {
	const count = o.context.config.jobs.workers;
	const pool = processes({ entry: o.entry, count, env: o.env, execArgv: o.execArgv });
	const orchestrator = orchestrate({
		context: o.context,
		jobs: o.jobs,
		dispatch: pool.dispatch,
		count,
		ready: o.ready,
	});

	/** Kills the jobs running, which run again. */
	const kill = () => pool.stop().then(orchestrator.stop);

	/** Gives the jobs running `GRACE` to finish, then kills them. */
	const stop = async () => {
		const stopped = orchestrator.stop();
		await Promise.race([stopped, setTimeout(GRACE, undefined, { ref: false })]);
		await pool.stop();
		await stopped;
	};

	return { kill, stop, recycle: pool.recycle };
};

type OrchestrateOptions = {
	context: RupeeContext;
	jobs: Job<unknown>[];
	dispatch: Dispatch;
	count: number;
	/** Claims start once it settles. */
	ready: Promise<unknown>;
};

/** Ticks on `count` loops until stopped, releasing and sweeping on timers. */
export const orchestrate = (o: OrchestrateOptions) => {
	if (o.count === 0) return stopped(o.context);

	const stopping = new AbortController();
	const signal = stopping.signal;
	const idle = () => setTimeout(POLL_EVERY, undefined, { signal }).catch(() => undefined);
	const loop = async () => {
		await Promise.race([o.ready, once(signal, 'abort')]);
		while (!signal.aborted) {
			const ticked = await provide(o.context, () => tick(o).orTee(logged).unwrapOr(false));
			if (!ticked) await idle();
		}
	};

	const names = o.jobs.map((j) => j.name);
	const sweeping = setInterval(
		() => provide(o.context, () => sweep(names).orTee(logged)),
		SWEEP_EVERY,
	);
	const releasing = setInterval(
		() => provide(o.context, () => releaseExpired(o.jobs).orTee(logged)),
		RELEASE_EVERY,
	);
	const loops = Array.from({ length: o.count }, loop);

	return {
		stop: async () => {
			stopping.abort();
			clearInterval(sweeping);
			clearInterval(releasing);
			await Promise.all(loops);
		},
	};
};

type TickOptions = {
	jobs: Job<unknown>[];
	dispatch: Dispatch;
};

/** Claims the next due job, dispatches it and settles how it ended; false when none was due. */
export const tick = (o: TickOptions): ResultAsync<boolean> =>
	claimJob(o.jobs, LEASE).andThen((c) =>
		c ? dispatchAndSettle(o, c).map(() => true) : okAsync(false),
	);

/** Queues again, or fails, the claims whose lease ran out because their worker died. */
export const releaseExpired = (l: Job<unknown>[]): ResultAsync<void> =>
	listExpired(RELEASED_AT_ONCE)
		.andThen((e) => batchAsync(e.map((r) => settle(r, abandoned(l, r)))))
		.map((b) => b.failed.forEach(logged));

const stopped = (c: RupeeContext) => {
	c.logger.warn('jobs stopped, since there are no workers');
	return { stop: () => Promise.resolve() };
};

const dispatchAndSettle = (o: TickOptions, c: ClaimedJob): ResultAsync<void> =>
	findJob(o.jobs, c.name).asyncAndThen((j) =>
		asJob(c, () =>
			holdClaim(c, () => o.dispatch(c, timeoutOf(j)))
				.map(() => null)
				.orElse((e) => okAsync(e))
				.andThen((e) => settle(c, endingOf(c.attempts, e, j.retries))),
		),
	);

/** How a run whose worker stopped settles: like an `UnknownError` of its job, if we know it. */
const abandoned = (l: Job<unknown>[], r: Run): Ending => {
	const retries = findJob(l, r.name).map((j) => j.retries);
	return endingOf(r.attempts, ABANDONED, retries.unwrapOr(undefined));
};

/** Renews the claim's lease until `f` settles. */
const holdClaim = <T>(c: ClaimedJob, f: () => ResultAsync<T>): ResultAsync<T> =>
	withContext()((context) => {
		const renew = () => provide(context, () => renewLease(c, LEASE).orTee(logged));
		const renewing = setInterval(renew, RENEW_EVERY);
		return f()
			.andTee(() => clearInterval(renewing))
			.orTee(() => clearInterval(renewing));
	});

const settle = (r: Run, e: Ending): ResultAsync<void> =>
	withLogger('jobs')((l) => {
		if (e.type === 'succeeded') {
			l.info('job succeeded');
			return finishJob(r, null);
		}

		if (e.type === 'retried') {
			l.warn({ error: e.error }, 'job failed, retrying');
			return retryJob(r, e.error, e.delay);
		}

		l.error({ error: e.error }, 'job failed');
		return finishJob(r, e.error);
	});

const logged = (e: RupeeError) =>
	withLogger('jobs')((l) => l.error({ error: e }, 'jobs could not be run'));
