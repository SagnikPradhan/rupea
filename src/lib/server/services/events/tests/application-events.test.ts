import { provide } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync } from '#lib/server/shared/result/result.ts';
import { publish, type Event, type Subscription } from '#services/events/application/events.ts';
import { it } from '#tests/shared/vitest.ts';
import * as v from 'valibot';
import { describe, expect } from 'vitest';

const checked = { name: 'checked', payload: v.pipe(v.string(), v.minLength(1)) };
const other = { name: 'other', payload: v.string() };

const recording = (event: Event<string>, seen: string[]): Subscription<string> => ({
	event,
	run: (p, u) => {
		seen.push(`${u}:${p}`);
		return okAsync(undefined);
	},
});

const failing: Subscription<string> = {
	event: checked,
	run: () => errAsync(fault('StorageNotFound', { key: 'a' })),
};

describe('publishing an event', () => {
	it('runs each of its subscribers with the payload, as the user', ({ context }) => {
		const seen: string[] = [];
		const subscriptions = [
			recording(checked, seen),
			recording(other, seen),
			recording(checked, seen),
		];

		return provide({ ...context, subscriptions }, async () => {
			const published = await publish({ event: checked, user: 'u1', payload: 'a' });

			expect(published._unsafeUnwrap()).toEqual([]);
			expect(seen).toEqual(['u1:a', 'u1:a']);
		});
	});

	it('runs the rest when one fails, and returns what failed', ({ context }) => {
		const seen: string[] = [];
		const subscriptions = [failing, recording(checked, seen)];

		return provide({ ...context, subscriptions }, async () => {
			const published = await publish({ event: checked, user: 'u1', payload: 'a' });

			expect(published._unsafeUnwrap()).toEqual([fault('StorageNotFound', { key: 'a' })]);
			expect(seen).toEqual(['u1:a']);
		});
	});

	it('runs the rest when one throws, and returns why', ({ context }) => {
		const seen: string[] = [];
		const throwing: Subscription<string> = {
			event: checked,
			run: () => {
				throw new Error('subscriber bug');
			},
		};

		return provide(
			{ ...context, subscriptions: [throwing, recording(checked, seen)] },
			async () => {
				const published = await publish({ event: checked, user: 'u1', payload: 'a' });

				expect(published._unsafeUnwrap()).toMatchObject([{ type: 'UnknownError' }]);
				expect(seen).toEqual(['u1:a']);
			},
		);
	});

	it('fails with a payload its event does not accept', ({ context }) => {
		const seen: string[] = [];

		return provide({ ...context, subscriptions: [recording(checked, seen)] }, async () => {
			const published = await publish({ event: checked, user: 'u1', payload: '' });

			expect(published).toMatchObject({ error: { type: 'EventInvalidPayload', name: 'checked' } });
			expect(seen).toEqual([]);
		});
	});
});
