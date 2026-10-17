import { startWorkers } from '#services/jobs/application/workers.ts';
import { fileURLToPath } from 'node:url';
import { jobs } from './jobs';
import type { RupeeContext } from './shared/context/context';

/** Worker entries, relative to this module, which the build puts in build/server/entries. */
const WORKER = {
	source: { entry: '../../worker.ts', execArgv: ['--import', 'tsx'] },
	built: { entry: '../../worker/worker.js', execArgv: [] },
};

type ServerWorkersOptions = {
	/** Where workers reach the server's database. */
	database: string;
	context: RupeeContext;
	dev: boolean;
};

/** Starts this server's workers; a dev reload kills the jobs running, which run again. */
export const startServerWorkers = async (o: ServerWorkersOptions) => {
	await import.meta.hot?.data.killWorkers?.();

	const source = o.dev ? WORKER.source : WORKER.built;
	const workers = startWorkers({
		entry: fileURLToPath(new URL(source.entry, import.meta.url)),
		execArgv: source.execArgv,
		env: workerEnv(o),
		context: o.context,
		jobs,
		ready: modelsReady(o.context),
	});

	if (import.meta.hot) import.meta.hot.data.killWorkers = workers.kill;
	return { stop: workers.stop };
};

/** Jobs wait for the server to download the models, which workers then only check. */
const modelsReady = (c: RupeeContext) =>
	c.models.ready().match(
		() => undefined,
		(e) => c.logger.warn({ error: e }, 'models not downloaded, jobs that need them fail'),
	);

/** Workers read their configuration as the server does, from these variables over its own. */
const workerEnv = (o: ServerWorkersOptions) => ({
	DATABASE_URL: o.database,
	RUPEE_MODELS_MODE: 'verify',
	NODE_ENV: o.dev ? 'development' : 'production',
});
