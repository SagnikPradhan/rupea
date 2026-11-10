import { requireMigrations } from '#lib/server/db/migrate.ts';
import { readConfiguration } from '#lib/server/shared/context/config.ts';
import { createContext, createDatabase } from '#lib/server/shared/context/environment.ts';
import { fileURLToPath } from 'node:url';
import { startServer, subscriptions } from '#lib/server/server.ts';

/** Past this a stop that has not finished gives up, above the workers' grace. */
const STOP_DEADLINE = 30_000;

const worker = fileURLToPath(new URL('./worker.js', import.meta.url));
const dev = process.env['NODE_ENV'] === 'development';

const config = readConfiguration(process.env);

const start = async () => {
	requireMigrations();

	const database = await createDatabase(config);
	const context = createContext(config, database.db, dev, subscriptions);
	return startServer({ worker, database, context, dev });
};

const starting = start();
const stopping = { started: false };

const shutdown = (reason: string) => {
	if (stopping.started) return process.exit(1);
	stopping.started = true;
	console.error(`stopping: ${reason}`);

	setTimeout(() => process.exit(1), STOP_DEADLINE).unref();
	starting
		.then((s) => s.stop())
		.then(
			() => process.exit(0),
			() => process.exit(1),
		);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
	console.error('unhandled rejection', error);
	shutdown('unhandled rejection');
});

await starting.catch((error: unknown) => {
	console.error('the server did not start', error);
	process.exit(1);
});
