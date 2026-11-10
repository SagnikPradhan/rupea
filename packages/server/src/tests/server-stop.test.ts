import { requireMigrations } from '#lib/server/db/migrate.ts';
import { startServer } from '#lib/server/server.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { createServer } from 'node:net';
import { describe, expect, vi } from 'vitest';

const workers = vi.hoisted(() => ({ stops: [] as (() => Promise<void>)[] }));

vi.mock('#services/jobs/application/orchestrator.ts', () => ({
	startWorkers: () => ({ stop: () => workers.stops.shift()!() }),
}));

const taken = () =>
	new Promise<{ port: number; free: () => void }>((done) => {
		const blocker = createServer();
		blocker.listen(0, '127.0.0.1', () => {
			const port = (blocker.address() as { port: number }).port;
			done({ port, free: () => void blocker.close() });
		});
	});

describe('stopping the server', () => {
	it('stops the steps after one that fails, then rejects', async ({ context, handle }) => {
		const close = vi.fn(() => Promise.resolve());
		workers.stops.push(() => Promise.reject(new Error('workers stuck')));
		const config = { ...context.config, server: { host: '127.0.0.1', port: 0 } };

		const server = await startServer({
			worker: 'worker.js',
			database: { ...handle, migrate: () => Promise.resolve(), close },
			context: { ...context, config },
			dev: false,
		});

		await expect(server.stop()).rejects.toThrow('stopping failed');
		expect(close).toHaveBeenCalledOnce();
	});

	it('stops what started when the port is taken', async ({ context, handle }) => {
		const close = vi.fn(() => Promise.resolve());
		const stopWorkers = vi.fn(() => Promise.resolve());
		workers.stops.push(stopWorkers);
		const blocker = await taken();
		const config = { ...context.config, server: { host: '127.0.0.1', port: blocker.port } };

		await expect(
			startServer({
				worker: 'worker.js',
				database: { ...handle, migrate: () => Promise.resolve(), close },
				context: { ...context, config },
				dev: false,
			}),
		).rejects.toThrow(/EADDRINUSE/);
		blocker.free();

		expect(stopWorkers).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
	});
});

describe('requiring the migrations', () => {
	it('names the folder and the directory when it is missing', () => {
		expect(() => requireMigrations('no-such-folder')).toThrow(
			/No no-such-folder folder in .*repository root/,
		);
		expect(() => requireMigrations('.')).not.toThrow();
	});
});
