import * as v from 'valibot';

const LIABILITY = /^Liabilities(:[^\s:=@{}]+)+$/;
const KEY = /^[a-z][a-z-]*$/;
const AMOUNT = /^\d[\d,]*(\.\d{1,10})?$/;
const PERCENT = /^\d+(\.\d+)?%?$/;
const WHOLE = /^\d+$/;

const Line = v.pipe(v.string(), v.trim());

/** The terms of one liability, a key and a one-line value each. */
export const TermsForm = v.object({
	account: v.pipe(Line, v.regex(LIABILITY, 'Pick an account under Liabilities.')),
	entries: v.array(
		v.tuple([
			v.pipe(Line, v.regex(KEY, 'A key is one lower-case word.')),
			v.pipe(Line, v.nonEmpty('Write a value.'), v.regex(/^[^\r\n]+$/, 'Write one line.')),
		]),
	),
});

const percent = v.pipe(
	v.string(),
	v.regex(PERCENT),
	v.transform((t) => Number.parseFloat(t)),
);
const whole = v.pipe(v.string(), v.regex(WHOLE), v.transform(Number));
const day = v.pipe(whole, v.minValue(1), v.maxValue(31));
const amount = v.pipe(v.string(), v.regex(AMOUNT));

export const LoanTerms = v.object({
	kind: v.literal('loan'),
	rate: v.optional(percent),
	payment: v.optional(amount),
	due: v.optional(day),
	method: v.optional(v.picklist(['reducing', 'flat']), 'reducing'),
	tenure: v.optional(v.pipe(whole, v.minValue(1))),
});

export const CardTerms = v.object({
	kind: v.literal('card'),
	limit: v.optional(amount),
	statement: v.optional(day),
	due: v.optional(day),
	apr: v.optional(percent),
});

/**
 * What a liability's dash lines say, read by its kind; a line that does not fit
 * says nothing.
 */
export const Terms = v.variant('kind', [LoanTerms, CardTerms]);
