import * as v from 'valibot';
import { isCounted } from './files.ts';

const ACCOUNT = /^(Assets|Liabilities|Income|Expenses|Equity)(:[^\s:=@{}]+)*$/;
const AMOUNT = /^[+-]?\d[\d,]*(\.\d{1,10})?$/;
const COMMODITY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const QUANTITY = /^\d[\d,]*(\.\d{1,10})?(\s+[A-Za-z][A-Za-z0-9._-]*)?$/;
const KEY = /^[^\s:]+$/;
const TERM_KEY = /^[a-z][a-z-]*$/;
const UNSIGNED_AMOUNT = /^\d[\d,]*(\.\d{1,10})?$/;
const PERCENT = /^\d+(\.\d+)?%?$/;
const WHOLE = /^\d+$/;

/** Groups are made on the refine page, which keeps both sides of a link in step. */
const GROUP_KEYS = new Set(['group', 'same-as']);

const Line = v.pipe(v.string(), v.trim());

/** Matches a pattern, or is left empty. */
const optional = (pattern: RegExp, message: string) =>
	v.pipe(
		Line,
		v.check((t) => t === '' || pattern.test(t), message),
	);

const Entry = v.object({
	key: v.pipe(
		Line,
		v.regex(KEY, 'A key is one word.'),
		v.check((k) => !GROUP_KEYS.has(k), 'Groups are made on the refine page.'),
	),
	value: v.pipe(Line, v.nonEmpty('Write a value.')),
});

const Posting = v.pipe(
	v.object({
		account: v.pipe(Line, v.regex(ACCOUNT, 'Pick an account, like Expenses:Food.')),
		amount: optional(AMOUNT, 'Write a number, like 100.50.'),
		commodity: optional(COMMODITY, 'Write a currency, like USD.'),
		price: optional(QUANTITY, 'Write a price, like 180.25 USD.'),
		total: v.boolean(),
		cost: optional(QUANTITY, 'Write a cost, like 1500 or 20 USD.'),
		costDate: v.union([v.literal(''), v.pipe(v.string(), v.isoDate('Pick a day.'))], 'Pick a day.'),
		balance: optional(AMOUNT, 'Write a number, like 100.50.'),
		comment: v.string(),
		metadata: v.array(Entry),
	}),
	v.forward(
		v.check(
			(p) => p.amount !== '' || (p.commodity === '' && p.price === '' && p.cost === ''),
			'Write the amount this goes with.',
		),
		['amount'],
	),
	v.forward(
		v.check((p) => p.costDate === '' || p.cost !== '', 'Write the cost this date goes with.'),
		['cost'],
	),
);

/** A time input leaves off its seconds when they are zero. */
const Time = v.union(
	[v.literal(''), v.pipe(v.string(), v.isoTime()), v.pipe(v.string(), v.isoTimeSecond())],
	'Pick a time.',
);

/**
 * A transaction as its form holds it, each box checked on its own; whether it
 * balances is for the server.
 */
export const TransactionForm = v.object({
	file: v.pipe(
		Line,
		v.endsWith('.rupea', 'Ledger files end in .rupea.'),
		v.check(isCounted, 'Files in the review area don’t count.'),
	),
	date: v.pipe(v.string(), v.isoDate('Pick a day.')),
	time: Time,
	description: v.pipe(Line, v.nonEmpty('Write a description.')),
	comment: v.string(),
	metadata: v.array(Entry),
	postings: v.array(Posting),
});

export type TransactionForm = v.InferOutput<typeof TransactionForm>;

const MetadataOut = v.object({ key: v.string(), value: v.string() });

/**
 * A transaction going out as a form holds it. It carries what a file has,
 * including links to groups and files in the review area, which the form
 * refuses to take back.
 */
export const TransactionFormOut = v.object({
	file: v.string(),
	date: v.string(),
	time: v.string(),
	description: v.string(),
	comment: v.string(),
	metadata: v.array(MetadataOut),
	postings: v.array(
		v.object({
			account: v.string(),
			amount: v.string(),
			commodity: v.string(),
			price: v.string(),
			total: v.boolean(),
			cost: v.string(),
			costDate: v.string(),
			balance: v.string(),
			comment: v.string(),
			metadata: v.array(MetadataOut),
		}),
	),
});

/** The dash lines of one account, a key and a one-line value each. */
const Lines = v.array(
	v.tuple([
		v.pipe(Line, v.regex(TERM_KEY, 'A key is one lower-case word.')),
		v.pipe(Line, v.nonEmpty('Write a value.'), v.regex(/^[^\r\n]+$/, 'Write one line.')),
	]),
);

const percent = v.pipe(
	v.string(),
	v.regex(PERCENT),
	v.transform((t) => Number.parseFloat(t)),
);
const whole = v.pipe(v.string(), v.regex(WHOLE), v.transform(Number));
const day = v.pipe(whole, v.minValue(1), v.maxValue(31));
const amount = v.pipe(v.string(), v.regex(UNSIGNED_AMOUNT));

const LoanTerms = v.object({
	kind: v.literal('loan'),
	rate: v.optional(percent),
	payment: v.optional(amount),
	due: v.optional(day),
	method: v.optional(v.picklist(['reducing', 'flat']), 'reducing'),
	tenure: v.optional(v.pipe(whole, v.minValue(1))),
});

const CardTerms = v.object({
	kind: v.literal('card'),
	limit: v.optional(amount),
	statement: v.optional(day),
	due: v.optional(day),
	rate: v.optional(percent),
});

/** What an account's dash lines say, read by its kind. */
export const Terms = v.variant('kind', [LoanTerms, CardTerms]);

/** The terms to save for one account, which must read by their kind. */
export const TermsForm = v.object({
	account: v.pipe(Line, v.regex(ACCOUNT, 'Pick an account.')),
	entries: v.pipe(
		Lines,
		v.check((e) => v.is(Terms, Object.fromEntries(e)), 'Check the terms against the hints.'),
	),
});

/** What Terms reads, as it comes out: the numbers read, the amounts as written. */
export const TermsOut = v.variant('kind', [
	v.object({
		kind: v.literal('loan'),
		rate: v.optional(v.number()),
		payment: v.optional(v.string()),
		due: v.optional(v.number()),
		method: v.picklist(['reducing', 'flat']),
		tenure: v.optional(v.number()),
	}),
	v.object({
		kind: v.literal('card'),
		limit: v.optional(v.string()),
		statement: v.optional(v.number()),
		due: v.optional(v.number()),
		rate: v.optional(v.number()),
	}),
]);
