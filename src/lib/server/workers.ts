import { startWorkers } from '#services/jobs/application/workers.ts';
import { fileURLToPath } from 'node:url';
import { jobs } from './jobs';
import type { RupeeContext } from './shared/context/context';

/** Worker entries, relative to this module: `vite dev` watches one into .svelte-kit, and the build puts the other in build/server/entries. */
const WORKER = {
	dev: '../../../.svelte-kit/worker/worker.js',
	built: '../../worker/worker.js',
};

type ServerWorkersOptions = {
	/** Where workers reach the server's database. */
	database: string;
	context: RupeeContext;
	dev: boolean;
};

/** Starts this server's workers; a dev reload kills the jobs running, which run again, and a worker rebuild replaces idle workers. */
export const startServerWorkers = async (o: ServerWorkersOptions) => {
	await import.meta.hot?.data.killWorkers?.();

	const entry = o.dev ? WORKER.dev : WORKER.built;
	const workers = startWorkers({
		entry: fileURLToPath(new URL(entry, import.meta.url)),
		execArgv: [],
		env: workerEnv(o),
		context: o.context,
		jobs,
		ready: modelsReady(o.context),
	});

	if (import.meta.hot) import.meta.hot.data.killWorkers = workers.kill;
	import.meta.hot?.on('rupee:worker-built', () => void workers.recycle());
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
