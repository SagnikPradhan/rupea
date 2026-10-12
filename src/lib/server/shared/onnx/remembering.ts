import { okAsync, type ResultAsync } from '../result/result';

export type Embed = (texts: string[]) => ResultAsync<Float32Array[]>;

// Keeps the `size` vectors last asked for, so texts that come up on every
// call, like account names, skip the model.
export const remembering = (embed: Embed, size: number): Embed => {
	const kept = new Map<string, Float32Array>();
	const keep = (t: string, v: Float32Array) => {
		kept.delete(t);
		kept.set(t, v);
		const oldest = kept.keys().next();
		if (kept.size > size && !oldest.done) kept.delete(oldest.value);
	};

	return (texts) => {
		const missing = [...new Set(texts)].filter((t) => !kept.has(t));
		const made = missing.length === 0 ? okAsync<Float32Array[]>([]) : embed(missing);

		return made.map((v) => {
			const fresh: Record<string, Float32Array> = Object.fromEntries(
				missing.map((t, i) => [t, v[i] ?? new Float32Array()]),
			);
			const found = texts.map((t) => fresh[t] ?? kept.get(t) ?? new Float32Array());

			texts.forEach((t, i) => keep(t, found[i] ?? new Float32Array()));
			return found;
		});
	};
};
