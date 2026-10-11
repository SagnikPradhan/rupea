import { errAsync, okAsync } from '#lib/server/shared/result.ts';
import { hashVector } from '#tests/shared/embedding.ts';
import { describe, expect, it } from 'vitest';
import type { Embed, EmbeddingStore } from './prediction';
import { remembering } from './remembering';

const setup = () => {
	const saved = new Map<string, Float32Array>();
	const seen: string[][] = [];
	const embed: Embed = (texts) => {
		seen.push(texts);
		return okAsync(texts.map(hashVector));
	};
	const store: EmbeddingStore = {
		find: (texts) =>
			okAsync(new Map(texts.flatMap((t) => (saved.has(t) ? [[t, saved.get(t)!] as const] : [])))),
		save: (vectors) => {
			vectors.forEach((v, t) => saved.set(t, v));
			return okAsync();
		},
	};
	return { embed, store, seen };
};

describe('an embed that remembers', () => {
	it('embeds a text once, however many times it is asked', async () => {
		const { embed, store, seen } = setup();
		const embedding = remembering(embed, store);

		const first = await embedding(['swiggy order', 'dmart']);
		const second = await embedding(['dmart', 'swiggy order', 'uber']);

		expect(seen).toEqual([['swiggy order', 'dmart'], ['uber']]);
		expect(second._unsafeUnwrap()).toEqual(['dmart', 'swiggy order', 'uber'].map(hashVector));
		expect(first._unsafeUnwrap()[0]).toEqual(second._unsafeUnwrap()[1]);
	});

	it('does not call the model when everything is remembered', async () => {
		const { embed, store, seen } = setup();
		const embedding = remembering(embed, store);
		await embedding(['dmart']);
		await embedding(['dmart']);
		expect(seen).toHaveLength(1);
	});

	it('still answers when it cannot remember', async () => {
		const { embed, store } = setup();
		const failing: EmbeddingStore = {
			...store,
			save: () => errAsync({ type: 'UnknownError', message: 'full', cause: [] }),
		};
		const embedding = remembering(embed, failing);
		expect((await embedding(['dmart']))._unsafeUnwrap()).toEqual([hashVector('dmart')]);
	});

	it('fails when the model does', async () => {
		const { store } = setup();
		const embed: Embed = () => errAsync({ type: 'UnknownError', message: 'no', cause: [] });
		const embedding = remembering(embed, store);
		expect((await embedding(['dmart'])).isErr()).toBe(true);
	});
});
