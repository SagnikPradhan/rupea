import { provide, withContext, type RupeaContext } from '#lib/server/shared/context/context.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { batchAsync } from '#lib/server/shared/result/batch.ts';
import { unknownError, type RupeaError } from '@rupea/shared/errors.ts';
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
import { endingOf, findHandler, timeoutOf, type Ending, type Handler } from '../domain/jobs';
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
	/**
	 * The worker module, the flags Node needs to run it, and the variables it
	 * reads.
	 */
	entry: string;
	execArgv: string[];
	env: Record<string, string>;
	context: RupeaContext;
	handlers: Handler<unknown>[];
	/** Settles once the workers' models are ready; nothing is claimed before. */
	ready: Promise<void>;
};

/**
 * Orchestrates jobs here and runs each in one of up to `jobs.workers`
 * processes.
 */
export const startWorkers = (o: StartOptions) => {
	const count = o.context.config.jobs.workers;
	const pool = processes({ entry: o.entry, count, env: o.env, execArgv: o.execArgv });
	const orchestrator = orchestrate({
		context: o.context,
		handlers: o.handlers,
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
	context: RupeaContext;
	handlers: Handler<unknown>[];
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

	const names = o.handlers.map((h) => h.job.name);
	const sweeping = setInterval(
		() => provide(o.context, () => sweep(names).orTee(logged)),
		SWEEP_EVERY,
	);
	const releasing = setInterval(
		() => provide(o.context, () => releaseExpired(o.handlers).orTee(logged)),
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
	handlers: Handler<unknown>[];
	dispatch: Dispatch;
};

/**
 * Claims the next due job, dispatches it and settles how it ended; false when
 * none was due.
 */
export const tick = (o: TickOptions): ResultAsync<boolean> =>
	claimJob(
		o.handlers.map((h) => h.job),
		LEASE,
	).andThen((c) => (c ? dispatchAndSettle(o, c).map(() => true) : okAsync(false)));

/**
 * Queues again, or fails, the claims whose lease ran out because their worker
 * died.
 */
export const releaseExpired = (l: Handler<unknown>[]): ResultAsync<void> =>
	listExpired(RELEASED_AT_ONCE)
		.andThen((e) => batchAsync(e.map((r) => settle(r, abandoned(l, r)))))
		.map((b) => b.failed.forEach(logged));

const stopped = (c: RupeaContext) => {
	c.logger.warn('jobs stopped, since there are no workers');
	return { stop: () => Promise.resolve() };
};

const dispatchAndSettle = (o: TickOptions, c: ClaimedJob): ResultAsync<void> =>
	findHandler(o.handlers, c.name).asyncAndThen((h) =>
		asJob(c, () =>
			holdClaim(c, () => o.dispatch(c, timeoutOf(h.job)))
				.map(() => null)
				.orElse((e) => okAsync(e))
				.andThen((e) => settle(c, endingOf(c.attempts, e, h.job.retries))),
		),
	);

/**
 * How a run whose worker stopped settles: like an `UnknownError` of its job, if
 * we know it.
 */
const abandoned = (l: Handler<unknown>[], r: Run): Ending => {
	const retries = findHandler(l, r.name).map((h) => h.job.retries);
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

const logged = (e: RupeaError) =>
	withLogger('jobs')((l) => l.error({ error: e }, 'jobs could not be run'));
