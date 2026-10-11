import { okAsync } from '#lib/server/shared/result.ts';
import type { Embed, EmbeddingStore } from './prediction';

export const remembering =
	(embed: Embed, store: EmbeddingStore): Embed =>
	(texts) =>
		store.find(texts).andThen((known) => {
			const missing = texts.filter((t) => !known.has(t));
			const made =
				missing.length === 0
					? okAsync(new Map<string, Float32Array>())
					: embed(missing)
							.map((v) => new Map(missing.map((t, i) => [t, v[i] ?? new Float32Array()])))
							.andTee(store.save);
			return made.map((m) => texts.map((t) => known.get(t) ?? m.get(t) ?? new Float32Array()));
		});
