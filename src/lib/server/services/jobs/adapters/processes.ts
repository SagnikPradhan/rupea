import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { Tinypool } from 'tinypool';
import type { ClaimedJob } from './database';

/** Idle workers exit, so a server with no jobs to run holds no models. */
const IDLE = 5 * 60 * 1000;

type ProcessesOptions = {
	/** The module whose default export runs a claimed job and returns its error or null. */
	entry: string;
	count: number;
	/** Added to the server's own, since Tinypool gives a child only the variables it is passed. */
	env: Record<string, string>;
	execArgv: string[];
};

export type Processes = {
	/** Kills the process running the job once it outlasts `timeout`, failing with `JobTimedOut`. */
	dispatch: (c: ClaimedJob, timeout: number) => ResultAsync<void>;
	stop: () => Promise<void>;
};

/** Runs each job in a child process, so a crash in native code takes down only that job. */
export const processes = (o: ProcessesOptions): Processes => {
	const pool = new Tinypool({
		filename: o.entry,
		runtime: 'child_process',
		minThreads: 0,
		maxThreads: o.count,
		idleTimeout: IDLE,
		env: { ...inherited(), ...o.env },
		execArgv: o.execArgv,
		serialization: 'advanced',
	});

	const dispatch = (c: ClaimedJob, timeout: number) => {
		const signal = AbortSignal.timeout(timeout);
		const timedOut = fault('JobTimedOut', { name: c.name, timeout });
		return attempt<RupeeError | null>(() => pool.run(c, { signal }))
			.mapErr((e) => (signal.aborted ? timedOut : e))
			.andThen((e) => (e ? errAsync(e) : okAsync(undefined)));
	};

	return { dispatch, stop: () => pool.destroy() };
};

const inherited = (): Record<string, string> =>
	Object.fromEntries(
		Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
	);
