import { createApi } from '#lib/server/api/api.ts';
import type { DatabaseHandle } from '#lib/server/db/index.ts';
import type { Subscription } from '#services/events/application/events.ts';
import { handlers as extraction } from '#services/extraction/adapters/jobs.ts';
import type { Handler } from '#services/jobs/application/jobs.ts';
import { startWorkers } from '#services/jobs/application/orchestrator.ts';
import { handlers as ledger } from '#services/ledger/adapters/jobs.ts';
import { syncChanged } from '#services/ledger/adapters/subscriptions.ts';
import { publishChanges } from '#services/storage/application/changes.ts';
import type { RupeaContext } from './shared/context/context';
import { startLoops, type Loop } from './shared/loops';

/** Every job a server claims and a worker runs. */
export const handlers: Handler<unknown>[] = [...extraction, ...ledger];

/** What runs when each event is published. */
export const subscriptions: Subscription<unknown>[] = [syncChanged];

/** Work the server does until it stops, outside any request or job. */
const loops: Loop[] = [publishChanges];

type ServerOptions = {
	/** The built entry that workers run. */
	worker: string;
	database: DatabaseHandle;
	context: RupeaContext;
	dev: boolean;
};

type Step = { name: string; stop: () => Promise<void> };

/**
 * Migrates, starts the jobs and loops and listens for requests. The stop it
 * returns refuses new requests first and closes the database last. When a step
 * fails, what already started stops in that order before it rejects.
 */
export const startServer = (o: ServerOptions) => {
	const started: Step[] = [{ name: 'database', stop: () => o.database.close() }];

	return start(o, started).catch(async (error: unknown) => {
		await stopAll(started, o.context).catch(() => undefined);
		return Promise.reject(error);
	});
};

/** Adds each step to `started` as it comes up, the last to stop first. */
const start = async (o: ServerOptions, started: Step[]) => {
	await o.database.migrate();

	const workers = startWorkers({
		entry: o.worker,
		execArgv: [],
		env: workerEnv(o),
		context: o.context,
		handlers,
		ready: modelsReady(o.context),
	});
	started.unshift({ name: 'workers', stop: workers.stop });

	const halt = startLoops(o.context, loops);
	started.unshift({ name: 'loops', stop: halt });

	const api = await createApi(o.context);
	started.unshift({ name: 'api', stop: () => api.close() });

	const { host, port } = o.context.config.server;
	await api.listen({ host, port });

	return {
		/**
		 * The port it listens on, which differs from the configured one when that
		 * is 0.
		 */
		port: (api.server.address() as { port: number }).port,
		/** Stops every step, logs those that fail, then rejects if any did. */
		stop: () => stopAll(started, o.context),
	};
};

const stopAll = async (steps: Step[], c: RupeaContext) => {
	const failures: unknown[] = [];
	for (const step of steps)
		await step.stop().catch((error: unknown) => {
			c.logger.error({ error, step: step.name }, 'step failed to stop');
			failures.push(error);
		});

	if (failures.length > 0) return Promise.reject(new AggregateError(failures, 'stopping failed'));
};

/**
 * Jobs wait for the server to download the models, which workers then only
 * check.
 */
const modelsReady = (c: RupeaContext) =>
	c.models.ready().match(
		() => undefined,
		(e) => c.logger.warn({ error: e }, 'models not downloaded, jobs that need them fail'),
	);

/**
 * Workers read their configuration as the server does, from these variables
 * over its own.
 */
const workerEnv = (o: ServerOptions) => ({
	DATABASE_URL: o.database.url,
	RUPEA_MODELS_MODE: 'verify',
	NODE_ENV: o.dev ? 'development' : 'production',
});
