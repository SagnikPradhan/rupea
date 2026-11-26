import { describe, expect, it } from 'vitest';
import {
	lastMonthOf,
	owedOf,
	savedOf,
	statementOf,
	spanOf,
	monthsBefore,
} from '#lib/web/shared/home.ts';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

const amount = (t: string) => parseAmount(t) as Amount;

describe('the days the home page reads', () => {
	it('goes 24 months back from a day', () => {
		expect(monthsBefore('2026-11-03', 24)).toBe('2024-11-03');
	});

	it('moves a day the month lacks to its last', () => {
		expect(monthsBefore('2028-02-29', 24)).toBe('2026-02-28');
		expect(monthsBefore('2026-05-31', 3)).toBe('2026-02-28');
	});

	it('goes back across a year end', () => {
		expect(monthsBefore('2026-01-31', 2)).toBe('2025-11-30');
	});

	it('names the month before a day, across a year end', () => {
		expect(lastMonthOf('2026-11-03')).toBe('2026-10');
		expect(lastMonthOf('2026-01-15')).toBe('2025-12');
	});
});

describe('what is owed', () => {
	it('shows what is owed as a size', () => {
		expect(owedOf('-3543489')).toBe('3543489');
	});
});

describe('the income statement', () => {
	const total = (account: string, n: string) => ({
		account,
		parent: account === 'Expenses' ? null : 'Expenses',
		amount: amount(n),
		unpriced: 0,
	});
	const month = (amounts: Record<string, string>) => ({
		buckets: [],
		deltas: [],
		totals: Object.entries(amounts).map(([a, n]) => total(a, n)),
	});

	it('weighs each group against the month before, the largest first', () => {
		const now = month({ Expenses: '300', 'Expenses:Rent': '200', 'Expenses:Food': '100' });
		const then = month({ Expenses: '250', 'Expenses:Rent': '200', 'Expenses:Food': '50' });

		const { rows, total: spent } = statementOf('Expenses', now, then);

		expect(rows.map((r) => [r.name, r.amount, r.before])).toEqual([
			['Rent', amount('200'), amount('200')],
			['Food', amount('100'), amount('50')],
		]);
		expect([spent.amount, spent.before]).toEqual([amount('300'), amount('250')]);
	});

	it('keeps a group that spent only in the month before', () => {
		const now = month({ Expenses: '100', 'Expenses:Food': '100' });
		const then = month({ Expenses: '300', 'Expenses:Food': '100', 'Expenses:Travel': '200' });

		const { rows, total: spent } = statementOf('Expenses', now, then);

		expect(rows.map((r) => [r.name, r.amount, r.before])).toEqual([
			['Food', amount('100'), amount('100')],
			['Travel', amount('0'), amount('200')],
		]);
		expect(spent.before).toBe(amount('300'));
	});

	it('names the five largest groups and sums the rest', () => {
		const groups = Object.fromEntries(
			['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => [`Expenses:${n}`, String(70 - i * 10)]),
		);
		const { rows } = statementOf('Expenses', month({ Expenses: '280', ...groups }), undefined);

		expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'Everything else']);
		expect(rows.at(-1)?.amount).toBe(amount('30'));
		expect(rows.at(-1)?.before).toBe(amount('0'));
	});

	it('keeps the full account of groups that share a name', () => {
		const { rows } = statementOf(
			'Expenses',
			month({ Expenses: '30', 'Expenses:Refund': '10', 'Expenses:Work:Refund': '20' }),
			undefined,
		);

		expect(rows.map((r) => r.account)).toEqual(['Expenses:Work:Refund', 'Expenses:Refund']);
	});

	it('reads Income as sizes, though it is credited as negative amounts', () => {
		const pay = (n: string, m: string) => ({
			buckets: [],
			deltas: [],
			totals: [
				{ account: 'Income', parent: null, amount: amount(n), unpriced: 0 },
				{ account: 'Income:Salary', parent: 'Income', amount: amount(m), unpriced: 0 },
			],
		});

		const { rows, total } = statementOf('Income', pay('-500', '-500'), pay('-400', '-400'));

		expect(rows.map((r) => [r.name, r.amount, r.before])).toEqual([
			['Salary', amount('500'), amount('400')],
		]);
		expect(total.amount).toBe(amount('500'));
	});

	it('keeps the sign of an expense group refunds outweigh', () => {
		const now = month({ Expenses: '-50', 'Expenses:Food': '-50' });
		expect(statementOf('Expenses', now, undefined).rows[0]?.amount).toBe(amount('-50'));
	});

	it('saves what income leaves after spending', () => {
		const saved = savedOf(
			{ amount: amount('500'), before: amount('400') },
			{ amount: amount('300'), before: amount('350') },
		);
		expect(saved).toEqual({ amount: amount('200'), before: amount('50') });
	});

	it('is empty without spending', () => {
		const { rows, total: spent } = statementOf('Expenses', undefined, undefined);
		expect(rows).toEqual([]);
		expect(spent.amount).toBe(amount('0'));
	});
});

describe('the header chips', () => {
	it('reads a span as the months before today, or all time', () => {
		expect(spanOf('60', '2026-11-03')).toEqual({
			kind: 'custom',
			from: '2021-11-03',
			to: '2026-11-03',
		});
		expect(spanOf('all', '2026-11-03')).toEqual({ kind: 'all' });
	});
});
