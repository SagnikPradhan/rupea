import { provide } from '#lib/server/shared/context/context.ts';
import { okAsync } from '#lib/server/shared/result/result.ts';
import type { Subscription } from '#services/events/application/events.ts';
import { filesChanged, publishChanges } from '#services/storage/application/changes.ts';
import { it } from '#tests/shared/vitest.ts';
import { untilSeen } from '#tests/shared/watch.ts';
import { describe, expect } from 'vitest';

const text = (s: string) => new TextEncoder().encode(s);

const recording = (seen: string[][]): Subscription<{ keys: string[] }> => ({
	event: filesChanged,
	run: (e, user) => {
		seen.push([user, ...e.keys]);
		return okAsync(undefined);
	},
});

describe('publishing changes', () => {
	it("publishes the keys that changed in each user's storage, until stopped", ({
		context,
		storage,
	}) => {
		const seen: string[][] = [];

		return provide({ ...context, subscriptions: [recording(seen)] }, async () => {
			await storage.write({ key: 'users/u1/a.rupea', content: text('') });
			const controller = new AbortController();
			const publishing = publishChanges(controller.signal);

			await untilSeen(
				async () => {
					await storage.write({ key: 'users/u1/a.rupea', content: text('') });
					await storage.write({ key: 'users/u1/b.rupea', content: text('') });
				},
				() => seen.some((s) => s.includes('b.rupea')),
			);
			controller.abort();
			await publishing;

			expect(seen.every(([user]) => user === 'u1')).toBe(true);
			expect(seen.flat()).toContain('a.rupea');
		});
	});

	it('keeps publishing after a change no subscriber can handle', ({ context, storage }) => {
		const seen: string[][] = [];
		const failing: Subscription<{ keys: string[] }> = {
			event: filesChanged,
			run: () => {
				throw new Error('subscriber bug');
			},
		};

		return provide({ ...context, subscriptions: [failing, recording(seen)] }, async () => {
			await storage.write({ key: 'users/u1/a.rupea', content: text('') });
			const controller = new AbortController();
			const publishing = publishChanges(controller.signal);

			await untilSeen(
				() => storage.write({ key: 'users/u1/a.rupea', content: text('') }),
				() => seen.length >= 2,
			);
			controller.abort();
			await publishing;
		});
	});
});
