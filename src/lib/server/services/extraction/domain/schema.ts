import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { safely } from '#lib/server/shared/control.ts';
import { isDateFormat } from '#lib/server/shared/dates.ts';
import { accountType } from '#services/ledger/application/shared.ts';
import * as v from 'valibot';
import { parseDocument } from 'yaml';
import { STATEMENT_ERA } from './types';

const Regex = v.pipe(
	v.string(),
	v.check((p) => safely(() => new RegExp(p)) !== undefined, 'is not a valid regular expression'),
	v.transform((p) => new RegExp(p)),
);

const DateFormat = v.pipe(
	v.string(),
	v.check(
		(f) => safely(() => isDateFormat(f, STATEMENT_ERA)) === true,
		'must be a date-fns format that pins down a year, month and day',
	),
);

// A string for now; an object form that looks the account up can join it without breaking schemas.
const Account = v.pipe(
	v.string(),
	v.regex(/^\S+$/, 'is one word, like Assets:Bank:HDFC'),
	v.check((a) => accountType(a) !== null, 'starts with an account type, like Assets'),
);

const Pattern = v.union([
	v.strictObject({ file: v.string() }),
	v.strictObject({ text: v.string() }),
	v.strictObject({ regex: Regex }),
]);

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));

const Locator = v.union([
	v.strictObject({ col: v.pipe(v.string(), v.regex(/^[A-Z]+$/, 'is a column letter')) }),
	v.strictObject({ header: v.string() }),
	v.strictObject({ text: v.string() }),
	v.strictObject({ regex: Regex }),
	v.strictObject({ left: Count }),
	v.strictObject({ right: Count }),
	v.strictObject({ above: Count }),
	v.strictObject({ below: Count }),
]);

const Transform = v.union([
	v.picklist(['trim', 'number', 'negate']),
	v.strictObject({ replace: v.strictObject({ from: v.string(), to: v.string() }) }),
	v.strictObject({ date: DateFormat }),
]);

const Path = v.strictObject({
	from: v.pipe(v.array(Locator), v.minLength(1, 'needs a locator')),
	pipe: v.optional(v.array(Transform), []),
});

const Field = v.pipe(
	v.union([Path, v.pipe(v.array(Path), v.minLength(1, 'needs a path'))]),
	v.transform((f) => (Array.isArray(f) ? f : [f])),
);

const Schema = v.strictObject({
	version: v.literal('v1'),
	name: v.string(),
	// Any one pattern recognises a statement: `file:` globs its name; `text:` and `regex:` search the cells of its grid and the lines outside it.
	match: v.optional(v.array(Pattern), []),
	account: v.optional(Account),
	header: v.optional(
		v.union([v.strictObject({ text: v.string() }), v.strictObject({ regex: Regex })]),
	),
	records: v.optional(
		v.strictObject({
			each: v.literal('row'),
			where: v.optional(v.strictObject({ col: v.string(), matches: Regex })),
		}),
		{ each: 'row' },
	),
	fields: v.strictObject({
		date: Field,
		amount: Field,
		description: Field,
		category: v.optional(Field),
		// The running balance a statement prints, as the account sees it.
		balance: v.optional(Field),
	}),
});

export type RupeaSchema = v.InferOutput<typeof Schema>;
export type Path = v.InferOutput<typeof Path>;
export type Pattern = v.InferOutput<typeof Pattern>;
export type Locator = v.InferOutput<typeof Locator>;
export type Transform = v.InferOutput<typeof Transform>;

export const parseSchema = (key: string, content: string): Result<RupeaSchema> => {
	const document = parseDocument(content);
	const [syntax] = document.errors;
	if (syntax) return invalid(key, syntax.message);

	const parsed = v.safeParse(Schema, document.toJS());
	return parsed.success ? ok(parsed.output) : invalid(key, v.summarize(parsed.issues));
};

const invalid = (p: string, r: string): Result<never> =>
	err(fault('ExtractionInvalidSchema', { path: p, reason: r }));
