/**
 * Extraction schemas: YAML that says how to read a statement's grid into
 * records. The first row matching `header` (the first non-blank row without
 * one) names the columns; every non-blank row below it, kept by
 * `records.where`, is a record. A row repeating the header is not.
 *
 * Each field is read along a path: `from` is a walk of locators starting at
 * the record's row, whose cell then runs through `pipe`. A field may list
 * several paths; the first that yields a value of the field's kind wins, so
 * a statement with separate debit and credit columns reads as:
 *
 *     version: v1
 *     name: HDFC savings
 *     header:
 *       text: Narration
 *     records:
 *       each: row
 *       where:
 *         col: Date
 *         matches: '^\d{2}/\d{2}/\d{2}$'
 *     fields:
 *       date:
 *         from: [header: Date]
 *         pipe: [date: dd/MM/yy]
 *       description:
 *         from: [header: Narration]
 *         pipe: [trim]
 *       amount:
 *         - from: [header: Withdrawal Amt.]
 *           pipe: [number, negate]
 *         - from: [header: Deposit Amt.]
 *           pipe: [number]
 *
 * Locators: `col: B` (a column by letter), `header: Date` (by header name),
 * `text` / `regex` (the first cell in the current row that is / matches
 * it), and `left` / `right` / `above` / `below: n` (move by `n` cells).
 * Transforms: `trim`, `replace: { from, to }`, `number` (an exact amount,
 * ignoring `₹`, `INR` and commas), `negate`, and `date: <date-fns format>`.
 */
import { isDateFormat } from '#lib/server/services/ledger/domain/parser.ts';
import { err, ok, safely, type Result } from '#lib/server/shared/result.ts';
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
	}),
});

export type RupeeSchema = v.InferOutput<typeof Schema>;
export type Path = v.InferOutput<typeof Path>;
export type Locator = v.InferOutput<typeof Locator>;
export type Transform = v.InferOutput<typeof Transform>;

/** Read the schema in `text`, the content of the file at `path`. */
export const parseSchema = (path: string, text: string): Result<RupeeSchema> => {
	const document = parseDocument(text);
	const [syntax] = document.errors;
	if (syntax) return invalid(path, syntax.message);
	const parsed = v.safeParse(Schema, document.toJS());
	return parsed.success ? ok(parsed.output) : invalid(path, v.summarize(parsed.issues));
};

const invalid = (p: string, r: string): Result<never> =>
	err({ type: 'ExtractionInvalidSchema', path: p, reason: r, cause: [] });
