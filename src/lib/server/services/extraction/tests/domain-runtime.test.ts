import { err } from '#lib/server/shared/result/result.ts';
import { formatAmount } from '#services/ledger/application/shared.ts';
import { describe, expect, it } from 'vitest';
import { extract } from '#services/extraction/domain/runtime.ts';
import { parseSchema, type RupeeSchema } from '#services/extraction/domain/schema.ts';
import type { Grid } from '#services/extraction/domain/types.ts';

const schema = (text: string): RupeeSchema => {
	const parsed = parseSchema('test.yml', `version: v1\nname: Test\n${text}`);
	if (parsed.isErr()) throw new Error(JSON.stringify(parsed.error));
	return parsed.value;
};

const hdfc = schema(`
header:
  text: Narration
records:
  each: row
  where:
    col: Date
    matches: '^\\d{2}/\\d{2}/\\d{2}$'
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yy] }
  description: { from: [header: Narration] }
  amount:
    - from: [header: Withdrawal Amt.]
      pipe: [number, negate]
    - from: [header: Deposit Amt.]
      pipe: [number]
`);

const statement: Grid = [
	['HDFC BANK Ltd.', '', '', ''],
	['Statement of account', '', '', ''],
	['', '', '', ''],
	['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.'],
	['********', '********', '********', '********'],
	['29/08/26', 'UPI-GROCER', '1,250.50', ''],
	['30/08/26', 'SALARY  AUG', '', '50,000.00'],
	['', '', '', ''],
	['STATEMENT SUMMARY', '', '', ''],
];

const summary = (grid: Grid, using = hdfc) => {
	const result = extract({ schema: using, file: 'hdfc.csv', grid });
	if (result.isErr()) return result;
	return {
		failed: result.value.failed,
		succeeded: result.value.succeeded.map(({ location, date, amount, description, category }) =>
			[
				location.line,
				date.toString(),
				formatAmount(amount),
				description,
				...(category === null ? [] : [category]),
			].join(' '),
		),
	};
};

describe('reading rows against a schema', () => {
	it('reads the record rows below the header, in debit or credit', () => {
		expect(summary(statement)).toEqual({
			failed: [],
			succeeded: ['6 2026-08-29 -1250.50 UPI-GROCER', '7 2026-08-30 50000.00 SALARY  AUG'],
		});
	});

	it('reports a row that does not read and keeps going', () => {
		const grid = [...statement];
		grid.splice(6, 0, ['31/08/26', 'BROKEN', 'abc', '']);
		grid.splice(7, 0, ['31/08/26', '', '', '5']);
		grid.splice(8, 0, ['31/08/26', 'NOTHING', '', '']);
		expect(summary(grid)).toMatchObject({
			failed: [
				{
					type: 'ExtractionInvalidField',
					location: 'hdfc.csv:7',
					field: 'amount',
					reason: '"abc" is not a number',
				},
				{
					type: 'ExtractionInvalidField',
					location: 'hdfc.csv:8',
					field: 'description',
					reason: 'there is nothing to read',
				},
				{
					type: 'ExtractionInvalidField',
					location: 'hdfc.csv:9',
					field: 'amount',
					reason: 'there is nothing to read',
				},
			],
			succeeded: ['6 2026-08-29 -1250.50 UPI-GROCER', '10 2026-08-30 50000.00 SALARY  AUG'],
		});
	});

	it('says why a value is the wrong kind', () => {
		const loose = schema(`
fields:
  date: { from: [col: A], pipe: [negate] }
  amount: { from: [col: B] }
  description: { from: [col: C] }
`);
		expect(summary([['Date'], ['2026-08-29', '1', 'x']], loose)).toMatchObject({
			failed: [
				{
					field: 'date',
					reason: 'negate needs an amount, got the text "2026-08-29"',
				},
			],
		});
		const unparsed = schema(`
fields:
  date: { from: [col: A], pipe: [date: yyyy-MM-dd] }
  amount: { from: [col: B] }
  description: { from: [col: C] }
`);
		expect(summary([['Date'], ['2026-08-29', '1', 'x']], unparsed)).toMatchObject({
			failed: [{ field: 'amount', reason: 'expected an amount, got the text "1"' }],
		});
	});

	it('walks locators from the record row', () => {
		// Each record's date sits above it; its amount, right of a label.
		const walk = schema(`
fields:
  date: { from: [col: A, above: 1], pipe: [date: d MMM yyyy] }
  amount: { from: [text: Amount, right: 1], pipe: [number] }
  description: { from: [regex: '^Paid to ', right: 0], pipe: [replace: { from: 'Paid to ', to: '' }] }
  category: { from: [col: D] }
`);
		const grid: Grid = [
			['When', 'What'],
			['29 Aug 2026'],
			['Paid to Grocer', 'Amount', '-100', 'Food and Drink'],
		];
		expect(summary(grid, walk)).toMatchObject({
			failed: [{ location: 'hdfc.csv:2', field: 'date' }],
			succeeded: ['3 2026-08-29 -100.00 Grocer Food and Drink'],
		});
	});

	it('takes the first non-blank row as the header by default', () => {
		const plain = schema(`
fields:
  date: { from: [header: Date], pipe: [date: yyyy-MM-dd] }
  amount: { from: [col: B], pipe: [number] }
  description: { from: [header: What] }
`);
		expect(
			summary([[''], ['Date', 'Amount', 'What'], ['2026-08-29', '₹1,00,000', 'Rent'], []], plain),
		).toEqual({ failed: [], succeeded: ['3 2026-08-29 100000.00 Rent'] });
	});

	it('skips the header where it repeats, as on each page of a PDF', () => {
		const [title = [], , , header = [], , groceries = [], salary = []] = statement;
		// No `where`, so only the repeat check keeps the second header out.
		const unfiltered = schema(`
header:
  text: Narration
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yy] }
  description: { from: [header: Narration] }
  amount:
    - from: [header: Withdrawal Amt.]
      pipe: [number, negate]
    - from: [header: Deposit Amt.]
      pipe: [number]
`);
		const result = summary([title, header, groceries, header, salary], unfiltered);
		expect(result).toEqual({
			failed: [],
			succeeded: ['3 2026-08-29 -1250.50 UPI-GROCER', '5 2026-08-30 50000.00 SALARY  AUG'],
		});
	});

	it('finds the header by a pattern', () => {
		const patterned = schema(`
header:
  regex: '^Txn\\s+Date$'
fields:
  date: { from: [col: A], pipe: [date: yyyy-MM-dd] }
  amount: { from: [col: B], pipe: [number] }
  description: { from: [col: C] }
`);
		expect(
			summary(
				[['2026-01-01', '1', 'not a record'], ['Txn  Date'], ['2026-08-29', '5', 'Tea']],
				patterned,
			),
		).toEqual({ failed: [], succeeded: ['3 2026-08-29 5.00 Tea'] });
	});

	it('reads an optional category and balance, or leaves them out', () => {
		const full = schema(`
fields:
  date: { from: [col: A], pipe: [date: yyyy-MM-dd] }
  amount: { from: [col: B], pipe: [number] }
  description: { from: [col: C] }
  category: { from: [text: Category, right: 1] }
  balance: { from: [col: D], pipe: [number] }
`);
		const result = extract({
			schema: full,
			file: 'a.csv',
			grid: [
				['Date'],
				['2026-08-29', '-5', 'Tea', '995', 'Category', 'Food'],
				['2026-08-30', '-5', 'Tea', ''],
			],
		})._unsafeUnwrap();
		expect(
			result.succeeded.map((r) => [
				r.category,
				r.balance === null ? null : formatAmount(r.balance),
			]),
		).toEqual([
			['Food', '995.00'],
			[null, null],
		]);
	});

	it('reports a category or balance that is there but does not read', () => {
		const strict = schema(`
fields:
  date: { from: [col: A], pipe: [date: yyyy-MM-dd] }
  amount: { from: [col: B], pipe: [number] }
  description: { from: [col: C] }
  category: { from: [col: D], pipe: [number] }
  balance: { from: [col: E], pipe: [number] }
`);
		expect(
			summary(
				[['Date'], ['2026-08-29', '1', 'x', '7'], ['2026-08-29', '1', 'x', '', 'lots']],
				strict,
			),
		).toMatchObject({
			failed: [
				{ field: 'category', reason: 'expected text, got an amount' },
				{ field: 'balance', reason: '"lots" is not a number' },
			],
		});
	});

	it('says which kind a step got when it needs text', () => {
		const twice = schema(`
fields:
  date: { from: [col: A], pipe: [date: yyyy-MM-dd, trim] }
  amount: { from: [col: B], pipe: [number, number] }
  description: { from: [col: C] }
`);
		expect(summary([['Date'], ['2026-08-29', '1', 'x']], twice)).toMatchObject({
			failed: [{ field: 'date', reason: 'trim needs text, got a date' }],
		});
		const amounts = schema(`
fields:
  date: { from: [col: A], pipe: [date: yyyy-MM-dd] }
  amount: { from: [col: B], pipe: [number, number] }
  description: { from: [col: C] }
`);
		expect(summary([['Date'], ['2026-08-29', '1', 'x']], amounts)).toMatchObject({
			failed: [{ field: 'amount', reason: 'number needs text, got an amount' }],
		});
	});

	it('fails a statement with no header row', () => {
		expect(summary([['Something else']])).toEqual(
			err({ type: 'ExtractionMissingHeader', path: 'hdfc.csv' }),
		);
	});

	it('fails a statement missing a column the schema names', () => {
		expect(summary([['Date', 'Narration', 'Debit', 'Credit']])).toEqual(
			err({
				type: 'ExtractionMissingColumns',
				path: 'hdfc.csv',
				columns: ['Withdrawal Amt.', 'Deposit Amt.'],
			}),
		);
	});
});
