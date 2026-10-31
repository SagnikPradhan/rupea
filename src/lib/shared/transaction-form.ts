import * as v from 'valibot';
import { isCounted } from './folders';

const ACCOUNT = /^(Assets|Liabilities|Income|Expenses|Equity)(:[^\s:=@{}]+)*$/;
const AMOUNT = /^[+-]?\d[\d,]*(\.\d{1,10})?$/;
const COMMODITY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const QUANTITY = /^\d[\d,]*(\.\d{1,10})?(\s+[A-Za-z][A-Za-z0-9._-]*)?$/;
const KEY = /^[^\s:]+$/;

/** Groups are made on the refine page, which keeps both sides of a link in step. */
const GROUP_KEYS = ['group', 'same-as'];

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
		v.check((k) => !GROUP_KEYS.includes(k), 'Groups are made on the refine page.'),
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

/** A transaction as its form holds it, each box checked on its own; whether it balances is for the server. */
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
