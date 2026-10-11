import { provide } from '#lib/server/shared/context.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { EMBEDDING_DIMENSIONS } from '#lib/server/db/schema.ts';
import { embeddings } from './database';

// The column holds full-width vectors; the rest of these stay zero.
const vector = (...l: number[]) => {
	const v = new Float32Array(EMBEDDING_DIMENSIONS);
	v.set(l);
	return v;
};

describe('remembered embeddings', () => {
	it('come back as the vectors that were saved', ({ context, db }) =>
		provide(context, async () => {
			const ledgerId = await createLedger(db);
			const store = embeddings(ledgerId, 'm1');
			await store.save(
				new Map([
					['swiggy', vector(0.5, -0.25, 1)],
					['dmart', vector(0, 1, 0)],
				]),
			);

			const found = (await store.find(['swiggy', 'zomato'])).unwrapOr(new Map());
			expect([...found]).toEqual([['swiggy', vector(0.5, -0.25, 1)]]);
		}));

	it('belong to one ledger and one model', ({ context, db }) =>
		provide(context, async () => {
			const [one, two] = [await createLedger(db), await createLedger(db)];
			await embeddings(one, 'm1').save(new Map([['swiggy', vector(1)]]));

			expect((await embeddings(two, 'm1').find(['swiggy'])).unwrapOr(null)?.size).toBe(0);
			expect((await embeddings(one, 'm2').find(['swiggy'])).unwrapOr(null)?.size).toBe(0);
		}));

	it('are found among more texts than one query holds', ({ context, db }) =>
		provide(context, async () => {
			const ledgerId = await createLedger(db);
			const store = embeddings(ledgerId, 'm1');
			const texts = Array.from({ length: 1200 }, (_, i) => `text ${i}`);
			await store.save(new Map(texts.map((t, i) => [t, vector(i)])));

			const found = (await store.find(texts)).unwrapOr(new Map());
			expect(found.size).toBe(1200);
			expect(found.get('text 1100')).toEqual(vector(1100));
		}));

	it('keep the first vector when a text is saved again', ({ context, db }) =>
		provide(context, async () => {
			const store = embeddings(await createLedger(db), 'm1');
			await store.save(new Map([['swiggy', vector(1)]]));
			const again = await store.save(
				new Map([
					['swiggy', vector(2)],
					['dmart', vector(3)],
				]),
			);

			expect(again.isOk()).toBe(true);
			const found = (await store.find(['swiggy', 'dmart']))._unsafeUnwrap();
			expect(found).toEqual(
				new Map([
					['swiggy', vector(1)],
					['dmart', vector(3)],
				]),
			);
		}));
});
