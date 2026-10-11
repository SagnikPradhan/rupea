import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import type { ResultAsync } from '#lib/server/shared/result.ts';
import {
	AccountRoot,
	accountRoot,
	type Amount,
	type RupeeTransaction,
} from '#services/ledger/domain/types.ts';
import { taxonomy } from './taxonomy';
import { accountText, clean } from './text';

const NEIGHBOURS = 5;
const HISTORY = 2000;
const HALF_LIFE = 365;
const PRIOR = 0.25;
const GUESSED = /(^|:)Uncategorized$/;
const ROOTS: Record<'out' | 'in', AccountRoot[]> = {
	in: [AccountRoot.Income, AccountRoot.Assets, AccountRoot.Liabilities, AccountRoot.Equity],
	out: [AccountRoot.Expenses, AccountRoot.Liabilities, AccountRoot.Equity, AccountRoot.Assets],
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

export type EmbeddingStore = {
	find: (texts: string[]) => ResultAsync<Map<string, Float32Array>>;
	save: (vectors: Map<string, Float32Array>) => ResultAsync<void>;
};

export type ClassifierOptions = {
	thresholds: RupeeConfiguration['prediction'];
	account: string;
	lines: Line[];
	transactions: RupeeTransaction[];
	today: Temporal.PlainDate;
};

export type Classifier = {
	texts: string[];
	classify: (vectors: Float32Array[]) => Prediction[];
};

export const classifier = (options: ClassifierOptions): Classifier => {
	const past = pastOf(options.transactions);
	const cleaned = options.lines.map((l) => clean(l.description));

	// The user's own accounts, by name; the global ones only where they have none.
	const accounts = accountsOf(options.transactions);
	const ours = new Set(accounts);
	const candidates = [
		...accounts.map((a) => ({ account: a, text: accountText(a) })),
		...Object.entries(taxonomy)
			.filter(([a]) => !ours.has(a))
			.map(([a, about]) => ({ account: a, text: `${accountText(a)} ${about}` })),
	];

	const texts = [
		...new Set([...past.map((p) => p.text), ...cleaned, ...candidates.map((c) => c.text)]),
	].filter((t) => t !== '');

	const classify = (vectors: Float32Array[]) => {
		const vectorOf = new Map(texts.map((t, i) => [t, vectors[i]]));
		const found = (t: string) => vectorOf.get(t) ?? null;

		const examples = past.flatMap((p) => {
			const vector = found(p.text);
			return vector ? [{ ...p, vector }] : [];
		});
		const names = candidates.flatMap((c) => {
			const vector = found(c.text);
			return vector ? [{ account: c.account, vector }] : [];
		});

		const guess = predict({ ...options, examples, names });
		return options.lines.map((l, i) => guess({ ...l, vector: found(cleaned[i] ?? '') }));
	};

	return { texts, classify };
};

export type Named = { account: string; vector: Float32Array };

export type Example = Past & { vector: Float32Array };

export type Knowledge = {
	thresholds: RupeeConfiguration['prediction'];
	account: string;
	today: Temporal.PlainDate;
	examples: Example[];
	names: Named[];
};

export type Embedded = Line & { vector: Float32Array | null };

export const predict =
	(knowledge: Knowledge) =>
	(line: Embedded): Prediction => {
		const vector = line.vector;
		if (!vector) return fallback(line.amount);

		const fits = (a: string) => a !== knowledge.account && allowed(a, line.amount);
		const names = knowledge.names.filter((n) => fits(n.account));
		const nameScores = new Map(names.map((n) => [n.account, similarity(vector, n.vector)]));

		const voters = knowledge.examples
			.filter((e) => fits(e.account) && opposite(line.amount, e.amount))
			.map((e) => ({ example: e, similarity: similarity(vector, e.vector) }))
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, NEIGHBOURS);

		const history = new Map<string, number>();
		for (const voter of voters) {
			const example = voter.example;
			const recency = 0.5 ** (age(knowledge.today, example.date) / HALF_LIFE);
			const total = history.get(example.account) ?? 0;
			history.set(example.account, total + (voter.similarity * recency) / NEIGHBOURS);
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
	const root = amount < 0n ? AccountRoot.Expenses : AccountRoot.Income;
	return `${root}:Uncategorized`;
};

export const fallback = (amount: Amount): Prediction => ({
	account: fallbackAccount(amount),
	score: 0,
	source: 'fallback',
});

export type Past = {
	account: string;
	amount: Amount;
	date: Temporal.PlainDate;
	text: string;
};

// Uncategorised postings are unsettled guesses; learning from them would only
// make the guess surer.
export const pastOf = (transactions: RupeeTransaction[]): Past[] =>
	transactions
		.flatMap((t) =>
			t.postings
				.filter((p) => !GUESSED.test(p.account))
				.map((p) => ({
					account: p.account,
					amount: p.amount,
					date: t.date,
					text: clean(t.description),
				})),
		)
		.filter((p) => p.text !== '')
		.sort((a, b) => Temporal.PlainDate.compare(b.date, a.date))
		.slice(0, HISTORY);

export const accountsOf = (t: RupeeTransaction[]): string[] =>
	[...new Set(t.flatMap((x) => x.postings.map((p) => p.account)))].filter((a) => !GUESSED.test(a));

const similarity = (a: Float32Array, b: Float32Array) =>
	Math.max(
		0,
		a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0),
	);

const allowed = (account: string, amount: Amount) => {
	if (amount === 0n) return true;

	const root = accountRoot(account);
	return root !== null && ROOTS[amount < 0n ? 'out' : 'in'].includes(root);
};

const opposite = (l: Amount, p: Amount) => l === 0n || (l < 0n ? p > 0n : p < 0n);

const age = (t: Temporal.PlainDate, d: Temporal.PlainDate) =>
	Math.max(0, t.since(d, { largestUnit: 'days' }).days);

const best = (l: IteratorObject<[string, number]>) =>
	l.reduce<[string, number] | undefined>((t, s) => (!t || s[1] > t[1] ? s : t), undefined);
