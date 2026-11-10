import { describe, expect, it } from 'vitest';
import { duesOf, estimatesOf, linesOf, owedOf, rowsOf } from '#lib/web/shared/liabilities.ts';

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

	it('marks the accounts with nothing under them, the only ones that take terms', () => {
		const rows = rowsOf(owed, totals, false);

		expect(rows.map((r) => [r.account, r.leaf])).toEqual([
			['Liabilities:Loans', false],
			['Liabilities:Loans:Home', true],
			['Liabilities:Loans:Car', true],
			['Liabilities:Card', true],
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

	it('stops a loan at the payments that clear it', () => {
		const small = [held('Liabilities:Loans:Home', 'Liabilities', '-1000')];
		const dues = duesOf(
			owedOf(small),
			[
				{
					account: 'Liabilities:Loans:Home',
					held: {
						kind: 'loan' as const,
						payment: '30,000',
						due: 20,
						rate: 0,
						method: 'reducing' as const,
					},
				},
			],
			'2026-11-08',
			'2027-12-31',
		);

		expect(dues.map((d) => d.due)).toEqual(['2026-11-20']);
	});

	it('gives a loan in credit no dues', () => {
		const credit = [held('Liabilities:Loans:Home', 'Liabilities', '30000')];
		const dues = duesOf(
			owedOf(credit),
			[{ account: 'Liabilities:Loans:Home', held: { ...loan('30,000', 20), rate: 12 } }],
			'2026-11-08',
			'2027-12-31',
		);

		expect(dues).toEqual([]);
	});

	it('caps a due day of 31 to the last day of a short month', () => {
		const dues = duesOf(
			owed,
			[{ account: 'Liabilities:Card', held: { kind: 'card' as const, due: 31 } }],
			'2026-11-30',
			'2026-12-31',
		);

		expect(dues.map((d) => d.due)).toEqual(['2026-11-30', '2026-12-31']);
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
			'month',
		);

		expect(lines.map((l) => [l.label, l.pins.map((p) => [p.at, p.past])])).toEqual([
			[
				'Home',
				[
					['2026-01-01', true],
					['2026-02-01', true],
					['2026-12-01', false],
				],
			],
		]);
	});

	const home = {
		account: 'Liabilities:Loans:Home',
		held: { kind: 'loan' as const, method: 'reducing' as const, rate: 12, payment: '30,000' },
	};

	it('splits each pin into principal and interest, from the balance before it', () => {
		const lines = linesOf(
			owedOf(ACCOUNTS),
			[{ account: 'Liabilities:Loans:Home', bucket: '2026-01-01', amount: '30000' }],
			[{ key: 'Liabilities:Loans:Home', amount: 30000, due: '2026-12-05' }],
			'month',
			[home],
		);
		const [made, due] = lines[0]?.pins ?? [];

		expect(made?.interest).toBeCloseTo(2772.28, 1);
		expect(due?.interest).toBeCloseTo(2500);
	});

	it('charges no interest on pins that fall due after the loan is paid off', () => {
		const small = [
			held('Liabilities', null, '-1000'),
			held('Liabilities:Loans:Home', 'Liabilities', '-1000'),
		];
		const dues = ['2026-12-05', '2027-01-05', '2027-02-05'].map((due) => ({
			key: 'Liabilities:Loans:Home',
			amount: 30000,
			due,
		}));
		const pins = linesOf(owedOf(small), [], dues, 'month', [home])[0]?.pins ?? [];

		expect(pins.map((p) => p.interest)).toEqual([10, 0, 0]);
	});

	it('reports for a flat loan the interest its balance walk-back assumed', () => {
		const flat = {
			account: 'Liabilities:Loans:Home',
			held: {
				kind: 'loan' as const,
				method: 'flat' as const,
				rate: 12,
				payment: '1,000',
				tenure: 12,
			},
		};
		const cleared = [
			held('Liabilities', null, '0'),
			held('Liabilities:Loans:Home', 'Liabilities', '0'),
		];
		const paid = [{ account: 'Liabilities:Loans:Home', bucket: '2026-01-01', amount: '1000' }];
		const pin = linesOf(owedOf(cleared), paid, [], 'month', [flat])[0]?.pins[0];

		expect(pin?.interest).toBeCloseTo(1000 * (0.12 / 1.12));
	});

	it('leaves interest out for a year of payments and for a loan that cannot tell', () => {
		const paid = [{ account: 'Liabilities:Loans:Home', bucket: '2026-01-01', amount: '30000' }];
		const owed = owedOf(ACCOUNTS);

		expect(linesOf(owed, paid, [], 'year', [home])[0]?.pins[0]?.interest).toBe(0);
		expect(linesOf(owed, paid, [], 'month', [])[0]?.pins[0]?.interest).toBe(0);
	});
});

describe('the estimates of the loans', () => {
	const owed = owedOf(ACCOUNTS);
	const loan = (account: string, payment: string) => ({
		account,
		held: { kind: 'loan' as const, method: 'reducing' as const, rate: 12, payment },
	});

	it('adds up the interest a month and finds the month the last loan ends', () => {
		const e = estimatesOf(
			owed.filter((a) => a.account !== 'Liabilities:Card'),
			[loan('Liabilities:Loans:Home', '30,000'), loan('Liabilities:Loans:Car', '10,000')],
			'2026-11-08',
		);

		expect(e.interest).toBeCloseTo(3000);
		expect(e.clears).toBe('2027-08-01');
	});

	it('says nothing about when a loan ends that never clears', () => {
		const never = estimatesOf(
			owed.filter((a) => a.account === 'Liabilities:Loans:Home'),
			[loan('Liabilities:Loans:Home', '100')],
			'2026-11-08',
		);

		expect(never.clears).toBeNull();
		expect(never.interest).toBeCloseTo(2500);
	});

	it('leaves out a card', () => {
		const card = { account: 'Liabilities:Card', held: { kind: 'card' as const, limit: '90,000' } };
		const e = estimatesOf(
			owed.filter((a) => a.account !== 'Liabilities:Loans:Car'),
			[loan('Liabilities:Loans:Home', '30,000'), card],
			'2026-11-08',
		);

		expect(e.interest).toBeCloseTo(2500);
		expect(e.clears).toBe('2027-08-01');
	});

	it('says nothing at all while a debt has no terms', () => {
		const e = estimatesOf(owed, [loan('Liabilities:Loans:Home', '30,000')], '2026-11-08');

		expect(e).toEqual({ interest: null, clears: null });
		expect(estimatesOf(owed, [], '2026-11-08')).toEqual({ interest: null, clears: null });
	});

	it('says nothing at all when a loan that owes has no rate', () => {
		const noRate = {
			account: 'Liabilities:Loans:Car',
			held: { kind: 'loan' as const, method: 'reducing' as const, payment: '10,000' },
		};
		const e = estimatesOf(
			owed.filter((a) => a.account !== 'Liabilities:Card'),
			[loan('Liabilities:Loans:Home', '30,000'), noRate],
			'2026-11-08',
		);

		expect(e).toEqual({ interest: null, clears: null });
	});

	it('follows the accounts it is given', () => {
		const set = [loan('Liabilities:Loans:Home', '30,000')];
		const home = owed.filter((a) => a.account === 'Liabilities:Loans:Home');

		expect(estimatesOf(home, set, '2026-11-08').interest).toBeCloseTo(2500);
		expect(estimatesOf(owed, set, '2026-11-08').interest).toBeNull();
	});

	it('ends a month sooner when the due day is still ahead of the day', () => {
		const home = owed.filter((a) => a.account === 'Liabilities:Loans:Home');
		const due = (day: number) => [
			{
				...loan('Liabilities:Loans:Home', '30,000'),
				held: { ...loan('', '30,000').held, due: day },
			},
		];

		expect(estimatesOf(home, due(20), '2026-11-08').clears).toBe('2027-07-01');
		expect(estimatesOf(home, due(5), '2026-11-08').clears).toBe('2027-08-01');
		expect(estimatesOf(home, due(8), '2026-11-08').clears).toBe('2027-07-01');
		expect(estimatesOf(home, due(31), '2026-11-30').clears).toBe('2027-07-01');
		expect(estimatesOf(home, [loan('Liabilities:Loans:Home', '30,000')], '2026-11-08').clears).toBe(
			'2027-08-01',
		);
	});
});
