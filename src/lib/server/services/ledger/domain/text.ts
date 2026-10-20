const NOISE = new Set(['upi', 'neft', 'imps', 'rtgs', 'pos', 'ach', 'nach', 'ecs']);
const WORDS = /[^\p{L}\p{N}]+/u;

export const clean = (description: string): string =>
	description
		.toLowerCase()
		.replace(/\d{4,}/g, ' ')
		.split(WORDS)
		.filter((w) => w !== '' && !NOISE.has(w))
		.join(' ');

export const accountText = (account: string): string =>
	account
		.toLowerCase()
		.split(WORDS)
		.filter((w) => w !== '')
		.join(' ');

export type Unembedded = { id: string; description: string };
export type Filled = { id: string; vector: Float32Array | null };

// A description with no words gets no vector, but counts as done all the same.
export const filling = (rows: Unembedded[]) => {
	const cleaned = rows.map((r) => clean(r.description));
	const texts = [...new Set(cleaned)].filter((t) => t !== '');

	const fill = (vectors: Float32Array[]): Filled[] => {
		const found = lookup(texts, vectors);
		return rows.map((r, i) => ({ id: r.id, vector: found(cleaned[i] ?? '') }));
	};

	return { texts, fill };
};

export const lookup = (texts: string[], vectors: Float32Array[]) => {
	const vectorOf: Record<string, Float32Array | undefined> = Object.fromEntries(
		texts.map((t, i) => [t, vectors[i]]),
	);
	return (t: string): Float32Array | null => vectorOf[t] ?? null;
};
