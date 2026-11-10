import * as v from 'valibot';

const ACCOUNT = /^(Assets|Liabilities|Income|Expenses|Equity)(:[^\s:=@{}]+)*$/;
const KEY = /^[a-z][a-z-]*$/;
const AMOUNT = /^\d[\d,]*(\.\d{1,10})?$/;
const PERCENT = /^\d+(\.\d+)?%?$/;
const WHOLE = /^\d+$/;

const Line = v.pipe(v.string(), v.trim());

/** The dash lines of one account, a key and a one-line value each. */
const Lines = v.array(
	v.tuple([
		v.pipe(Line, v.regex(KEY, 'A key is one lower-case word.')),
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
const amount = v.pipe(v.string(), v.regex(AMOUNT));

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
