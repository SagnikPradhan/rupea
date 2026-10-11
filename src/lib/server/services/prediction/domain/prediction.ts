import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import type { ResultAsync } from '#lib/server/shared/result.ts';
import { AccountType, accountType, type Amount } from '#services/ledger/domain/types.ts';
import { taxonomy } from './taxonomy';
import { accountText, clean } from './text';

const NEIGHBOURS = 5;
const HALF_LIFE = 365;
const PRIOR = 0.25;
const GUESSED = /(^|:)Uncategorized$/;
const TYPES: Record<'out' | 'in', AccountType[]> = {
	in: [AccountType.Income, AccountType.Assets, AccountType.Liabilities, AccountType.Equity],
	out: [AccountType.Expenses, AccountType.Liabilities, AccountType.Equity, AccountType.Assets],
};

export type Source = 'history' | 'name' | 'fallback';

export type Prediction = {
	account: string;
	score: number;
	source: Source;
};

// `amount` is money into the statement's account; negative when it went out.
export type Line = {
	amount: Amount;
	description: string;
};

export type Embed = (texts: string[]) => ResultAsync<Float32Array[]>;

// A posting of a past transaction whose description is near a line's.
export type Neighbour = {
	account: string;
	amount: Amount;
	date: Temporal.PlainDate;
	similarity: number;
};

// The postings of the transactions nearest each vector, in the vectors' order.
export type Nearest = (vectors: Float32Array[]) => ResultAsync<Neighbour[][]>;

export type Unembedded = { id: string; description: string };

export type Filled = { id: string; vector: Float32Array | null };

export type History = {
	unembedded: (limit: number) => ResultAsync<Unembedded[]>;
	fill: (rows: Filled[]) => ResultAsync<void>;
	nearest: Nearest;
	accounts: () => ResultAsync<string[]>;
};

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

export type ClassifierOptions = {
	thresholds: RupeeConfiguration['prediction'];
	account: string;
	lines: Line[];
	accounts: string[];
	today: Temporal.PlainDate;
};

// `texts` are embedded first; `asked` takes their vectors to the ones to
// search near, and `classify` takes the vectors and what was found near them.
export type Classifier = {
	texts: string[];
	asked: (vectors: Float32Array[]) => Float32Array[];
	classify: (vectors: Float32Array[], nearest: Neighbour[][]) => Prediction[];
};

export const classifier = (options: ClassifierOptions): Classifier => {
	const cleaned = options.lines.map((l) => clean(l.description));
	const searched = [...new Set(cleaned)].filter((t) => t !== '');

	// The user's own accounts, by name; the global ones only where they have none.
	const accounts = options.accounts.filter((a) => !GUESSED.test(a));
	const ours = new Set(accounts);
	const candidates = [
		...accounts.map((a) => ({ account: a, text: accountText(a) })),
		...Object.entries(taxonomy)
			.filter(([a]) => !ours.has(a))
			.map(([a, about]) => ({ account: a, text: `${accountText(a)} ${about}` })),
	];

	const texts = [...new Set([...searched, ...candidates.map((c) => c.text)])].filter(
		(t) => t !== '',
	);

	const asked = (vectors: Float32Array[]) => {
		const found = lookup(texts, vectors);
		return searched.flatMap((t) => {
			const vector = found(t);
			return vector ? [vector] : [];
		});
	};

	const classify = (vectors: Float32Array[], nearest: Neighbour[][]) => {
		const found = lookup(texts, vectors);
		const near = Object.fromEntries(
			searched.filter((t) => found(t)).map((t, i) => [t, nearest[i] ?? []]),
		);
		const names = candidates.flatMap((c) => {
			const vector = found(c.text);
			return vector ? [{ account: c.account, vector }] : [];
		});

		const guess = predict({ ...options, names });
		return options.lines.map((l, i) => {
			const text = cleaned[i] ?? '';
			return guess({ ...l, vector: found(text), neighbours: near[text] ?? [] });
		});
	};

	return { texts, asked, classify };
};

const lookup = (texts: string[], vectors: Float32Array[]) => {
	const vectorOf: Record<string, Float32Array | undefined> = Object.fromEntries(
		texts.map((t, i) => [t, vectors[i]]),
	);
	return (t: string): Float32Array | null => vectorOf[t] ?? null;
};

export type Named = { account: string; vector: Float32Array };

export type Knowledge = {
	thresholds: RupeeConfiguration['prediction'];
	account: string;
	today: Temporal.PlainDate;
	names: Named[];
};

export type Embedded = Line & { vector: Float32Array | null; neighbours: Neighbour[] };

// Uncategorised postings are unsettled guesses; learning from them would only
// make the guess surer.
export const predict =
	(knowledge: Knowledge) =>
	(line: Embedded): Prediction => {
		const vector = line.vector;
		if (!vector) return fallback(line.amount);

		const fits = (a: string) => a !== knowledge.account && allowed(a, line.amount);
		const names = knowledge.names.filter((n) => fits(n.account));
		const nameScores = new Map(names.map((n) => [n.account, similarity(vector, n.vector)]));

		const voters = line.neighbours
			.filter((n) => fits(n.account) && !GUESSED.test(n.account) && opposite(line.amount, n.amount))
			.map((n) => ({ ...n, similarity: Math.max(0, n.similarity) }))
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, NEIGHBOURS);

		const history = new Map<string, number>();
		for (const voter of voters) {
			const recency = 0.5 ** (age(knowledge.today, voter.date) / HALF_LIFE);
			const total = history.get(voter.account) ?? 0;
			history.set(voter.account, total + (voter.similarity * recency) / NEIGHBOURS);
		}

		const remembered = best(
			history
				.entries()
				.map(([account, score]) => [account, score + PRIOR * (nameScores.get(account) ?? 0)]),
		);
		if (remembered && remembered[1] >= knowledge.thresholds.history)
			return { account: remembered[0], score: Math.min(1, remembered[1]), source: 'history' };

		const named = best(nameScores.entries());
		if (named && named[1] >= knowledge.thresholds.name)
			return { account: named[0], score: Math.min(1, named[1]), source: 'name' };

		return fallback(line.amount);
	};

export const fallbackAccount = (amount: Amount): string => {
	const type = amount < 0n ? AccountType.Expenses : AccountType.Income;
	return `${type}:Uncategorized`;
};

export const fallback = (amount: Amount): Prediction => ({
	account: fallbackAccount(amount),
	score: 0,
	source: 'fallback',
});

const similarity = (a: Float32Array, b: Float32Array) =>
	Math.max(
		0,
		a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0),
	);

const allowed = (account: string, amount: Amount) => {
	if (amount === 0n) return true;

	const type = accountType(account);
	return type !== null && TYPES[amount < 0n ? 'out' : 'in'].includes(type);
};

const opposite = (l: Amount, p: Amount) => l === 0n || (l < 0n ? p > 0n : p < 0n);

const age = (t: Temporal.PlainDate, d: Temporal.PlainDate) =>
	Math.max(0, t.since(d, { largestUnit: 'days' }).days);

const best = (l: IteratorObject<[string, number]>) =>
	l.reduce<[string, number] | undefined>((t, s) => (!t || s[1] > t[1] ? s : t), undefined);
