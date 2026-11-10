import { startServer } from '#lib/server/server.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect, vi } from 'vitest';

const listening = (port: number) =>
	fetch(`http://127.0.0.1:${port}/api/openapi.json`).then(
		(r) => r.ok,
		() => false,
	);

describe('starting the server', () => {
	it('migrates, listens and refuses requests before it closes the database', async ({
		context,
		handle,
	}) => {
		const config = { ...context.config, server: { host: '127.0.0.1', port: 0 } };
		const events: string[] = [];
		const migrate = vi.fn(() => Promise.resolve(void events.push('migrate')));
		const close = vi.fn(async () => void events.push(`close, listening: ${await listening(port)}`));
		const database = { ...handle, migrate, close };

		const server = await startServer({
			worker: 'worker.js',
			database,
			context: { ...context, config },
			dev: false,
		});
		const port = server.port;

		expect(await listening(port)).toBe(true);

		await server.stop();

		expect(events).toEqual(['migrate', 'close, listening: false']);
	});
});
