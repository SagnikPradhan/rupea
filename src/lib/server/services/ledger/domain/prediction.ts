import { type Amount } from './amounts';
import { taxonomy, accountType } from './taxonomy';
import { accountText, clean, lookup, wordsOf } from './text';
import { AccountType } from './types';

const NEIGHBOURS = 5;
const HALF_LIFE = 365;
const PRIOR = 0.25;

/** How alike a line must be to past spending, or to an account's name, to be guessed from it. */
export const THRESHOLDS: Thresholds = { history: 0.15, name: 0.35 };

/** Uncategorised postings are unsettled guesses; learning from them would only make the guess surer. */
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

export type Line = {
	/** Money into the statement's account; negative when it went out. */
	amount: Amount;
	description: string;
};

/** A posting of a past transaction whose description is near a line's. */
export type Neighbour = {
	account: string;
	amount: Amount;
	date: Temporal.PlainDate;
	similarity: number;
};

export type Thresholds = { history: number; name: number };

export type ClassifyOptions = {
	thresholds: Thresholds;
	account: string;
	lines: Line[];
	accounts: string[];
	today: Temporal.PlainDate;
};

type TextsOptions = { lines: Line[]; accounts: string[] };

/** What to embed: the words of each distinct line, which are searched near, then the accounts' names. */
export const textsOf = ({ lines, accounts }: TextsOptions) => {
	const searched = wordsOf(lines.map((l) => l.description));
	const named = candidates(accounts).map((c) => c.text);
	return { texts: [...new Set([...searched, ...named])], searched: searched.length };
};

/** `vectors` are those of `textsOf`'s texts, and `nearest` what was found near the searched ones. */
export const classify = (
	options: ClassifyOptions,
	vectors: Float32Array[],
	nearest: Neighbour[][],
): Prediction[] => {
	const texts = textsOf(options);
	const found = lookup(texts.texts, vectors);
	const near = lookup(texts.texts.slice(0, texts.searched), nearest);
	const names = candidates(options.accounts).flatMap((c) => {
		const vector = found(c.text);
		return vector ? [{ account: c.account, vector }] : [];
	});

	const guess = predict({ ...options, names });
	return options.lines.map((l) => {
		const words = clean(l.description);
		return guess({ ...l, vector: found(words), neighbours: near(words) ?? [] });
	});
};

export type Named = { account: string; vector: Float32Array };

export type Knowledge = {
	thresholds: Thresholds;
	account: string;
	today: Temporal.PlainDate;
	names: Named[];
};

export type Embedded = Line & { vector: Float32Array | null; neighbours: Neighbour[] };

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

/** The user's own accounts, by name, and the global ones only where they have none. */
const candidates = (accounts: string[]) => {
	const ours = accounts.filter((a) => !GUESSED.test(a));
	const owned = new Set(ours);
	return [
		...ours.map((a) => ({ account: a, text: accountText(a) })),
		...Object.entries(taxonomy)
			.filter(([a]) => !owned.has(a))
			.map(([a, about]) => ({ account: a, text: `${accountText(a)} ${about}` })),
	];
};

const allowed = (account: string, amount: Amount) => {
	if (amount === 0n) return true;

	const type = accountType(account);
	return type !== null && TYPES[amount < 0n ? 'out' : 'in'].includes(type);
};

const opposite = (l: Amount, p: Amount) => l === 0n || (l < 0n ? p > 0n : p < 0n);

const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);

const similarity = (a: Float32Array, b: Float32Array) => Math.max(0, dot(a, b));

const age = (t: Temporal.PlainDate, d: Temporal.PlainDate) =>
	Math.max(0, t.since(d, { largestUnit: 'days' }).days);

const best = (l: IteratorObject<[string, number]>) =>
	l.reduce<[string, number] | undefined>((t, s) => (!t || s[1] > t[1] ? s : t), undefined);
