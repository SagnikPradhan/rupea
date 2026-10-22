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

/** The words of each distinct description, leaving out those with none. */
export const wordsOf = (d: string[]): string[] =>
	[...new Set(d.map(clean))].filter((t) => t !== '');

/** `vectors` are those of the rows' `wordsOf`; a description with no words gets no vector, but counts as done all the same. */
export const filled = (rows: Unembedded[], vectors: Float32Array[]): Filled[] => {
	const found = lookup(wordsOf(rows.map((r) => r.description)), vectors);
	return rows.map((r) => ({ id: r.id, vector: found(clean(r.description)) }));
};

export const lookup = <T>(texts: string[], values: T[]) => {
	const valueOf: Record<string, T | undefined> = Object.fromEntries(
		texts.map((t, i) => [t, values[i]]),
	);
	return (t: string): T | null => valueOf[t] ?? null;
};
