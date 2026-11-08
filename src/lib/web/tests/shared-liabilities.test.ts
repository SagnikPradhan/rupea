import { describe, expect, it } from 'vitest';
import { duesOf, linesOf, owedOf, rowsOf } from '#lib/web/shared/liabilities.ts';

const held = (account: string, parent: string | null, total: string) => ({
	account,
	parent,
	total,
	unpriced: 0,
});

const ACCOUNTS = [
	held('Assets', null, '90000'),
	held('Assets:Bank', 'Assets', '90000'),
	held('Liabilities', null, '-325000'),
	held('Liabilities:Loans', 'Liabilities', '-300000'),
	held('Liabilities:Loans:Home', 'Liabilities:Loans', '-250000'),
	held('Liabilities:Loans:Car', 'Liabilities:Loans', '-50000'),
	held('Liabilities:Card', 'Liabilities', '-25000'),
	held('Liabilities:Loans:Old', 'Liabilities:Loans', '0'),
];

const moved = (account: string, amount: string) => ({ account, amount });

describe('what is owed', () => {
	it('keeps the accounts under Liabilities and counts what they hold as owed, not as a balance', () => {
		const owed = owedOf(ACCOUNTS);

		expect(owed.map((a) => [a.account, a.total])).toEqual([
			['Liabilities', '325000'],
			['Liabilities:Loans', '300000'],
			['Liabilities:Loans:Home', '250000'],
			['Liabilities:Loans:Car', '50000'],
			['Liabilities:Card', '25000'],
			['Liabilities:Loans:Old', '0'],
		]);
	});

	it('keeps every digit of a large amount with decimals', () => {
		const owed = owedOf([
			held('Liabilities:Loan', 'Liabilities', '-12345678901234567890.1234567891'),
		]);

		expect(owed.map((a) => a.total)).toEqual(['12345678901234567890.1234567891']);
	});

	it('shows an account in credit as owing less than nothing', () => {
		const owed = owedOf([
			held('Liabilities', null, '500'),
			held('Liabilities:Card', 'Liabilities', '500'),
		]);

		expect(owed.map((a) => a.total)).toEqual(['-500', '-500']);
	});
});

describe('the rows of the table', () => {
	const owed = owedOf(ACCOUNTS);
	const totals = [
		moved('Liabilities', '40000'),
		moved('Liabilities:Loans', '40000'),
		moved('Liabilities:Loans:Home', '30000'),
		moved('Liabilities:Loans:Car', '10000'),
	];

	it('leaves out the root and settled accounts that did not move, and gives each row what it paid down', () => {
		const rows = rowsOf(owed, totals, false);

		expect(rows.map((r) => [r.account, r.owed, r.paid])).toEqual([
			['Liabilities:Loans', '300000', '40000'],
			['Liabilities:Loans:Home', '250000', '30000'],
			['Liabilities:Loans:Car', '50000', '10000'],
			['Liabilities:Card', '25000', '0'],
		]);
	});

	it('keeps a settled account that moved in the period, as one paid off in it', () => {
		const rows = rowsOf(owed, [...totals, moved('Liabilities:Loans:Old', '8000')], false);

		expect(rows.map((r) => r.account)).toContain('Liabilities:Loans:Old');
	});

	it('treats a balance of 0.00 as settled', () => {
		const rows = rowsOf(owedOf([held('Liabilities:Old', 'Liabilities', '0.00')]), [], false);

		expect(rows).toEqual([]);
	});

	it('brings back every settled account when asked', () => {
		const rows = rowsOf(owed, totals, true);

		expect(rows.map((r) => r.account)).toContain('Liabilities:Loans:Old');
	});
});

describe('the payments due in the period', () => {
	const owed = owedOf(ACCOUNTS);
	const loan = (payment: string | undefined, due: number | undefined) => ({
		kind: 'loan' as const,
		payment,
		due,
		method: 'reducing' as const,
	});
	const set = [
		{ account: 'Liabilities:Loans:Home', held: loan('34,500', 5) },
		{ account: 'Liabilities:Loans:Car', held: loan('12,400', 10) },
		{ account: 'liabilities:card', held: { kind: 'card' as const, due: 31 } },
	];

	it('puts a payment on its due day of each month left, a card paying what it holds and a loan its payment', () => {
		const dues = duesOf(owed, set, '2026-11-08', '2026-12-31');

		expect(dues.map((d) => [d.label, d.amount, d.due])).toEqual([
			['Home', 34500, '2026-12-05'],
			['Car', 12400, '2026-11-10'],
			['Car', 12400, '2026-12-10'],
			['Card', 25000, '2026-11-30'],
			['Card', 25000, '2026-12-31'],
		]);
	});

	it('counts a payment due today and none after the period ends', () => {
		const dues = duesOf(owed, set, '2026-11-05', '2026-11-09');

		expect(dues.map((d) => d.due)).toEqual(['2026-11-05']);
	});

	it('leaves out groups, accounts with no due day or amount, and cards that hold nothing', () => {
		const dues = duesOf(
			owed,
			[
				{ account: 'Liabilities:Loans', held: loan('1', 5) },
				{ account: 'Liabilities:Loans:Home', held: loan(undefined, 5) },
				{ account: 'Liabilities:Loans:Car', held: loan('12,400', undefined) },
				{ account: 'Liabilities:Loans:Old', held: { kind: 'card' as const, due: 5 } },
				{ account: 'Liabilities:Card', held: null },
			],
			'2026-11-08',
			'2026-12-31',
		);

		expect(dues).toEqual([]);
	});
});

describe('the terms of the accounts', () => {
	it('gives each row its rate, monthly payment and due day, blank when the account has no terms', () => {
		const owed = owedOf(ACCOUNTS);
		const terms = [
			{
				account: 'Liabilities:Loans:Home',
				held: {
					kind: 'loan' as const,
					rate: 8.5,
					payment: '42,000',
					due: 5,
					method: 'reducing' as const,
				},
			},
			{ account: 'liabilities:card', held: { kind: 'card' as const, rate: 42, due: 20 } },
			{ account: 'Liabilities:Loans:Old', held: null },
		];
		const rows = rowsOf(owed, [], true, terms);
		const shown = (account: string) => rows.find((r) => r.account === account);

		expect(shown('Liabilities:Loans:Home')).toMatchObject({
			set: true,
			rate: 8.5,
			monthly: '42000',
			due: 5,
		});
		expect(shown('Liabilities:Card')).toMatchObject({
			set: true,
			rate: 42,
			monthly: null,
			due: 20,
		});
		expect(shown('Liabilities:Loans:Old')).toMatchObject({ set: true, rate: null });
		expect(shown('Liabilities:Loans:Car')).toMatchObject({
			set: false,
			rate: null,
			monthly: null,
			due: null,
		});
	});
});

describe('the lines of the timeline', () => {
	it('gives each account its payments made and still due, in order of day, and leaves out the rest', () => {
		const owed = owedOf(ACCOUNTS);
		const lines = linesOf(
			owed,
			[
				{ account: 'Liabilities:Loans:Home', bucket: '2026-02-01', amount: '30000' },
				{ account: 'Liabilities:Loans:Home', bucket: '2026-01-01', amount: '30000' },
				{ account: 'Liabilities:Loans:Car', bucket: '2026-01-01', amount: '0' },
				{ account: 'Liabilities:Loans', bucket: '2026-01-01', amount: '60000' },
			],
			[{ key: 'Liabilities:Loans:Home', amount: 34500, due: '2026-12-05' }],
		);

		expect(lines.map((l) => [l.label, l.pins.map((p) => [p.at, p.past])])).toEqual([
			[
				'Home',
				[
					['2026-01-01', true],
					['2026-02-01', true],
					['2026-12-05', false],
				],
			],
		]);
	});
});
