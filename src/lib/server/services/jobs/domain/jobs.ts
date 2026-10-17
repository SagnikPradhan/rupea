import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sha256 } from '#lib/server/shared/hash.ts';
import * as v from 'valibot';

const MAX_ATTEMPTS = 5;
const FIRST_DELAY = 10_000;
const TIMEOUT = 5 * 60 * 1000;
const RETRIED: RupeeError['type'][] = ['UnknownError'];

/**
 * Work a service runs outside a request. It may run more than once, so running it again must be
 * harmless. Its callbacks are methods, so a list of `Job<unknown>` holds a job of any payload.
 */
export type Job<P> = {
	name: string;
	/** Bumped when the payload changes shape; jobs of another version fail. */
	version: number;
	payload: v.GenericSchema<unknown, P>;
	/** The errors worth another attempt, `UnknownError` when left out. */
	retries?: RupeeError['type'][];
	/** Jobs of this name with the same partition run one at a time, the user's by default. */
	partition?(payload: P, user: string): string;
	/** A job whose dedupe key is already queued is not queued again, the payload by default. */
	dedupe?(payload: P): string;
	/** Milliseconds a run may take before its process is killed, five minutes when left out. */
	timeout?: number;
	run(payload: P, user: string): ResultAsync<void>;
};

export const findJob = (jobs: Job<unknown>[], name: string): Result<Job<unknown>> => {
	const job = jobs.find((j) => j.name === name);
	return job ? ok(job) : err(fault('JobUnknown', { name }));
};

export const partitionOf = <P>(j: Job<P>, p: P, u: string): string => j.partition?.(p, u) ?? u;

export const dedupeOf = <P>(j: Job<P>, p: P): string => j.dedupe?.(p) ?? sha256(JSON.stringify(p));

export const timeoutOf = <P>(j: Job<P>): number => j.timeout ?? TIMEOUT;

type Stored = { name: string; version: number; payload: unknown };

export const readPayload = <P>(job: Job<P>, stored: Stored): Result<P> => {
	if (stored.version !== job.version)
		return err(fault('JobOutdated', { name: stored.name, version: stored.version }));

	const parsed = v.safeParse(job.payload, stored.payload);
	if (!parsed.success)
		return err(
			fault('JobInvalidPayload', { name: stored.name, reason: v.summarize(parsed.issues) }),
		);
	return ok(parsed.output);
};

export type Ending =
	| { type: 'succeeded' }
	| { type: 'retried'; error: RupeeError; delay: number }
	| { type: 'failed'; error: RupeeError };

/** How a run that ended with `e` settles: retried while attempts are left and `retried` lists it. */
export const endingOf = (attempts: number, e: RupeeError | null, retried = RETRIED): Ending => {
	if (!e) return { type: 'succeeded' };
	if (attempts < MAX_ATTEMPTS && retried.includes(e.type))
		return { type: 'retried', error: e, delay: delayAfter(attempts) };
	return { type: 'failed', error: e };
};

const delayAfter = (attempts: number): number => {
	const full = FIRST_DELAY * 2 ** (attempts - 1);
	return full / 2 + (Math.random() * full) / 2;
};
