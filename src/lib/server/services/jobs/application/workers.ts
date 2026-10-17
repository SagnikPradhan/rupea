import type { RupeeContext } from '#lib/server/shared/context/context.ts';
import { setTimeout } from 'node:timers/promises';
import { processes } from '../adapters/processes';
import type { Job } from '../domain/jobs';
import { orchestrate } from './orchestrator';

/** Under the 30 seconds Kubernetes and others give before killing the server. */
const GRACE = 20_000;

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

	return { kill, stop };
};
