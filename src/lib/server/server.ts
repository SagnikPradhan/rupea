import type { DatabaseHandle } from '#lib/server/db/index.ts';
import type { Subscription } from '#services/events/application/events.ts';
import { importStatement } from '#services/extraction/adapters/jobs.ts';
import type { Job } from '#services/jobs/application/jobs.ts';
import { startWorkers } from '#services/jobs/application/orchestrator.ts';
import { fetchQuotes, syncLedger } from '#services/ledger/adapters/jobs.ts';
import { syncChanged } from '#services/ledger/adapters/subscriptions.ts';
import { publishChanges } from '#services/storage/application/changes.ts';
import { fileURLToPath } from 'node:url';
import type { ViteHotContext } from 'vite/types/hot.d.ts';
import type { RupeaContext } from './shared/context/context';
import { startLoops, type Loop } from './shared/loops';

/** Worker entries, relative to this module: `vite dev` watches one into .svelte-kit, and the build puts the other in build/server/entries. */
const WORKER = {
	dev: '../../../.svelte-kit/worker/worker.js',
	built: '../../worker/worker.js',
};

/** Every job a server claims and a worker runs. */
export const jobs: Job<unknown>[] = [importStatement, fetchQuotes, syncLedger];

/** What runs when each event is published. */
export const subscriptions: Subscription<unknown>[] = [syncChanged];

/** Work the server does until it stops, outside any request or job. */
const loops: Loop[] = [publishChanges];

type ServerOptions = {
	database: DatabaseHandle;
	context: RupeaContext;
	dev: boolean;
};

/** Starts the jobs and loops; a dev reload kills the last reload's, and shutdown stops them gracefully. */
export const startServer = async (o: ServerOptions) => {
	await import.meta.hot?.data.kill?.();
	await o.database.migrate();

	const workers = startWorkers({
		entry: fileURLToPath(new URL(o.dev ? WORKER.dev : WORKER.built, import.meta.url)),
		execArgv: [],
		env: workerEnv(o),
		context: o.context,
		jobs,
		ready: modelsReady(o.context),
	});
	const halt = startLoops(o.context, loops);

	if (import.meta.hot)
		watchBuilds(import.meta.hot, {
			kill: () => halt().then(workers.kill),
			recycle: workers.recycle,
		});
	if (!import.meta.hot)
		process.once('sveltekit:shutdown', () => halt().then(workers.stop).then(o.database.close));
};

/** Replaces the last reload's handlers, which would recycle workers it already killed. */
const watchBuilds = (
	hot: ViteHotContext,
	workers: { kill: () => Promise<void>; recycle: () => Promise<void> },
) => {
	if (hot.data.recycle) hot.off('rupea:worker-built', hot.data.recycle);

	hot.data.kill = workers.kill;
	hot.data.recycle = () => void workers.recycle();
	hot.on('rupea:worker-built', hot.data.recycle);
};

/** Jobs wait for the server to download the models, which workers then only check. */
const modelsReady = (c: RupeaContext) =>
	c.models.ready().match(
		() => undefined,
		(e) => c.logger.warn({ error: e }, 'models not downloaded, jobs that need them fail'),
	);

/** Workers read their configuration as the server does, from these variables over its own. */
const workerEnv = (o: ServerOptions) => ({
	DATABASE_URL: o.database.url,
	RUPEA_MODELS_MODE: 'verify',
	NODE_ENV: o.dev ? 'development' : 'production',
});
