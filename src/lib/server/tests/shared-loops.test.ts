import { withContext } from '#lib/server/shared/context/context.ts';
import { startLoops } from '#lib/server/shared/loops.ts';
import { it } from '#tests/shared/vitest.ts';
import { once } from 'node:events';
import { describe, expect } from 'vitest';

describe('running loops', () => {
	it('runs each loop in the context until stopped', async ({ context }) => {
		const seen: string[] = [];
		const loop = (s: AbortSignal) =>
			withContext('config')(async (config) => {
				seen.push(config.storage.files);
				await once(s, 'abort');
			});

		const stop = startLoops(context, [loop, loop]);
		await stop();

		expect(seen).toEqual([context.config.storage.files, context.config.storage.files]);
	});

	it('starts a loop again once it fails', async ({ context }) => {
		const starts: number[] = [];
		const loop = async (s: AbortSignal) => {
			starts.push(starts.length);
			if (starts.length === 1) throw new Error('watcher died');
			await once(s, 'abort');
		};

		const stop = startLoops(context, [loop]);
		await expect.poll(() => starts.length, { timeout: 3000 }).toBe(2);
		await stop();

		expect(starts).toEqual([0, 1]);
	});

	it('stops waiting to start a loop again once stopped', async ({ context }) => {
		const starts: number[] = [];
		const loop = async () => {
			starts.push(starts.length);
		};

		const stop = startLoops(context, [loop]);
		await expect.poll(() => starts.length).toBe(1);
		await stop();

		expect(starts).toEqual([0]);
	});
});
