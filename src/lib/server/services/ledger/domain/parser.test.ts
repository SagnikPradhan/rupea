import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from '#lib/server/shared/config.ts';
import {
	displayLocation,
	parseAmount,
	isDateFormat,
	isTimeFormat,
	parseDate,
	parseHeader,
	parseTime,
	parseTransactions,
	type RupeeLine,
} from './parser';
import { formatAmount, type Amount, type RupeePosting } from './types';
import { err, ok } from '#lib/server/shared/result.ts';

const file = 'random.rupee';
const at = displayLocation({ file, line: 1 });
const line = (content: string, index: number): RupeeLine => ({
	location: { file, line: index + 1 },
	content,
});

const run = (n: string[]) => parseTransactions(defaultConfiguration, n.map(line));

const transaction = (
	header: number,
	date: string,
	description: string,
	postings: RupeePosting[],
) => ({
	location: { file, line: header },
	date: Temporal.PlainDate.from(date),
	time: null,
	description,
	postings,
});

const posting = (account: string, amount: string | null): RupeePosting => ({
	account,
	amount: amount === null ? null : parseAmount(amount),
});

describe('parse transactions', () => {
	it('parses a transaction with one posting', () => {
		expect(run(['2026-08-29 Groceries', '\tExpenses:Food 100'])).toEqual({
			failed: [],
			succeeded: [transaction(1, '2026-08-29', 'Groceries', [posting('Expenses:Food', '100')])],
		});
	});

	it('parses a posting without an amount', () => {
		expect(run(['2026-08-29 Transfer', '\tAssets:Bank 100', '\tAssets:Savings'])).toEqual({
			failed: [],
			succeeded: [
				transaction(1, '2026-08-29', 'Transfer', [
					posting('Assets:Bank', '100'),
					posting('Assets:Savings', null),
				]),
			],
		});
	});

	it('reports an invalid transaction header', () => {
		expect(run(['not a transaction'])).toEqual({
			failed: [{ type: 'ParseInvalidTransactionHeader', location: at, cause: [] }],
			succeeded: [],
		});
	});

	it('reports a transaction with no body', () => {
		expect(run(['2026-08-29 Groceries'])).toEqual({
			failed: [{ type: 'ParseMissingTransactionBody', location: at, cause: [] }],
			succeeded: [],
		});
	});

	it('parses multiple transactions', () => {
		expect(
			run([
				'2026-08-29 Groceries',
				'\tExpenses:Food 100',
				'2026-08-30 Salary',
				'\tAssets:Bank 1000',
			]),
		).toEqual({
			failed: [],
			succeeded: [
				transaction(1, '2026-08-29', 'Groceries', [posting('Expenses:Food', '100')]),
				transaction(3, '2026-08-30', 'Salary', [posting('Assets:Bank', '1000')]),
			],
		});
	});

	it('reports an invalid posting', () => {
		expect(run(['2026-08-29 Groceries', '\ta b c'])).toEqual({
			failed: [
				{
					type: 'ParseInvalidPosting',
					location: displayLocation({ file, line: 2 }),
					cause: [],
				},
			],
			succeeded: [],
		});
	});
});

describe('blank lines', () => {
	it.each([[[]], [['']], [['', '  ', '\t']]])('parses nothing from %j', (n) => {
		expect(run(n)).toEqual({ failed: [], succeeded: [] });
	});

	it('separate transactions and may lead or trail', () => {
		expect(
			run([
				'',
				'2026-08-29 Groceries',
				'\tExpenses:Food 100',
				'',
				'\t',
				'2026-08-30 Salary',
				'\tAssets:Bank 1000',
				'  ',
			]),
		).toEqual({
			failed: [],
			succeeded: [
				transaction(2, '2026-08-29', 'Groceries', [posting('Expenses:Food', '100')]),
				transaction(6, '2026-08-30', 'Salary', [posting('Assets:Bank', '1000')]),
			],
		});
	});

	it('end the postings above them', () => {
		expect(run(['2026-08-29 Groceries', '', '\tExpenses:Food 100'])).toEqual({
			failed: [
				{ type: 'ParseMissingTransactionBody', location: at, cause: [] },
				{
					type: 'ParseInvalidTransactionHeader',
					location: displayLocation({ file, line: 3 }),
					cause: [],
				},
			],
			succeeded: [],
		});
	});
});

describe('reading an amount', () => {
	it.each([
		['100', 100_000_000n],
		['-1250.50', -1_250_500_000n],
		['+5', 5_000_000n],
		['₹1,250.50', 1_250_500_000n],
		['0.000001', 1n],
		['100abc', 100_000_000n],
	])('reads %j as %s millionths', (tx, am) => {
		expect(parseAmount(tx)).toBe(am);
	});

	it.each(['', 'abc', '₹', '.5', '1.2345678'])('rejects %j', (tx) => {
		expect(parseAmount(tx)).toBeNull();
	});
});

describe('writing an amount', () => {
	it.each([
		[100_000_000n, '100.00'],
		[-1_250_500_000n, '-1250.50'],
		[1n, '0.000001'],
		[-1n, '-0.000001'],
		[0n, '0.00'],
	])('writes %s millionths as %j', (am, tx) => {
		expect(formatAmount(am as Amount)).toBe(tx);
	});
});

describe('reading a date', () => {
	it.each([
		['yyyy-MM-dd', '2026-08-29'],
		['dd/MM/yyyy', '29/08/2026'],
		['d MMM yyyy', '29 Aug 2026'],
		['d MMM yyyy', '29 aug 2026'],
		['yyyyMMdd', '20260829'],
	])('parses %j / %j', (format, text) => {
		expect(parseDate({ format, text })).toEqual(Temporal.PlainDate.from('2026-08-29'));
	});

	it.each([
		['yyyy-MM-dd', '2026-02-30'],
		['yyyy-MM-dd', '2026-13-01'],
		['yyyy-MM-dd', '2026-00-10'],
		['yyyy-MM-dd', '29/08/2026'],
		['yyyy-MM-dd', '2026-08-29x'],
		['yyyy-MM-dd', '2026-8-29'],
		['dd/MM/yyyy', '29/08/26'],
		['d/M/yyyy', '29/08/2026'],
	])('rejects %j / %j', (ft, tx) => {
		expect(parseDate({ format: ft, text: tx })).toBeNull();
	});
});

describe('reading a time', () => {
	it.each([
		['HH:mm', '14:30', '14:30'],
		['H:mm', '9:05', '09:05'],
		['HH:mm:ss', '14:30:15', '14:30:15'],
		['h:mm a', '2:30 PM', '14:30'],
		['h:mm a', '12:15 am', '00:15'],
	])('parses %j / %j', (fmt, txt, tim) => {
		expect(parseTime({ format: fmt, text: txt })).toEqual(Temporal.PlainTime.from(tim));
	});

	it.each([
		['HH:mm', '24:00'],
		['HH:mm', '14:60'],
		['HH:mm', '9:05'],
		['HH:mm', 'Groceries'],
	])('rejects %j / %j', (ft, tx) => {
		expect(parseTime({ format: ft, text: tx })).toBeNull();
	});
});

describe('date formats', () => {
	it.each([...defaultConfiguration.dateFormats, 'yyyy-MM-dd HH:mm'])('accepts %j', (ft) => {
		expect(isDateFormat(ft)).toBe(true);
	});

	it.each(['yyyy-MM', 'MM-dd', 'yy-MM-dd'])('rejects %j', (ft) => {
		expect(isDateFormat(ft)).toBe(false);
	});

	it('throws on unknown tokens', () => {
		expect(() => isDateFormat('%Y-%m-%d')).toThrow(RangeError);
	});
});

describe('time formats', () => {
	it.each(defaultConfiguration.timeFormats)('accepts %j', (ft) => {
		expect(isTimeFormat(ft)).toBe(true);
	});

	it.each(['HH', 'mm:ss', 'h:mm'])('rejects %j', (ft) => {
		expect(isTimeFormat(ft)).toBe(false);
	});
});

describe('reading a transaction header', () => {
	const header = (c: string) => parseHeader(defaultConfiguration, line(c, 0));

	it.each([
		['2026-08-29 Groceries at the shop', null],
		['29/08/2026 Groceries at the shop', null],
		['29 Aug 2026 Groceries at the shop', null],
		['Aug 29, 2026 Groceries at the shop', null],
		['2026-08-29 18:45 Groceries at the shop', '18:45'],
		['29 August 2026 6:45 pm Groceries at the shop', '18:45'],
	])('reads %j', (content, time) => {
		expect(header(content)).toEqual(
			ok({
				date: Temporal.PlainDate.from('2026-08-29'),
				time: time === null ? null : Temporal.PlainTime.from(time),
				description: 'Groceries at the shop',
			}),
		);
	});

	it('keeps a word that is not a time in the description', () => {
		expect(header('2026-08-29 24:00 madness')).toMatchObject({
			value: { time: null, description: '24:00 madness' },
		});
	});

	it.each(['2026-08-29', '2026-08-29 18:45', '08/29/2026 Groceries'])('rejects %j', (content) => {
		expect(header(content)).toMatchObject(err({ type: 'ParseInvalidTransactionHeader' }));
	});
});
