import { describe, expect, it } from 'vitest';
import * as Liabilities from '#lib/web/shared/liabilities.ts';
import { type Amount, parseAmount, toNumber } from '@rupea/shared/money.ts';
import type { Span } from '@rupea/shared/dates.ts';
import type { Terms } from '@rupea/shared/forms.ts';
import type * as v from 'valibot';

const amount = (t: string) => parseAmount(t) as Amount;
const num = (a: Amount | null | undefined) => (a === null || a === undefined ? null : toNumber(a));
const on = (d: string) => Temporal.PlainDate.from(d);

const balance = (account: string, parent: string | null, total: string) => ({
	account,
	parent,
	total: amount(total),
	unpriced: 0,
});

const ACCOUNTS = [
	balance('Assets', null, '90000'),
	balance('Assets:Bank', 'Assets', '90000'),
	balance('Liabilities', null, '-325000'),
	balance('Liabilities:Loans', 'Liabilities', '-300000'),
	balance('Liabilities:Loans:Home', 'Liabilities:Loans', '-250000'),
	balance('Liabilities:Loans:Car', 'Liabilities:Loans', '-50000'),
	balance('Liabilities:Card', 'Liabilities', '-25000'),
	balance('Liabilities:Loans:Old', 'Liabilities:Loans', '0'),
];

type Held = v.InferOutput<typeof Terms> | null;

type Listed = { account: string; held: Held }[];

const debts = (terms: Listed = [], accounts = ACCOUNTS) =>
	Liabilities.debtsFrom(Liabilities.accountsIn(accounts), terms);

const duesIn = (d: Liabilities.Debt[], s: Span) => d.flatMap((x) => Liabilities.duesOn(x, s));

const loan = (account: string, terms: { payment?: string; due?: number; rate?: number }) => ({
	account,
	held: { kind: 'loan' as const, method: 'reducing' as const, ...terms },
});

const card = (account: string, due: number) => ({
	account,
	held: { kind: 'card' as const, due },
});

const paid = (account: string, inflow: string, outflow = '0') => ({
	account,
	inflow: amount(inflow),
	outflow: amount(outflow),
});

const made = (account: string, bucket: string, n: string) => ({
	account,
	bucket: on(bucket),
	inflow: amount(n),
});

describe('what is owed', () => {
	it('keeps the accounts under Liabilities and counts what they hold as owed, not as a balance', () => {
		const owed = Liabilities.accountsIn(ACCOUNTS);

		expect(owed.map((a) => [a.account, a.total])).toEqual([
			['Liabilities', amount('325000')],
			['Liabilities:Loans', amount('300000')],
			['Liabilities:Loans:Home', amount('250000')],
			['Liabilities:Loans:Car', amount('50000')],
			['Liabilities:Card', amount('25000')],
			['Liabilities:Loans:Old', amount('0')],
		]);
	});

	it('keeps every digit of a large amount with decimals', () => {
		const owed = Liabilities.accountsIn([
			balance('Liabilities:Loan', 'Liabilities', '-12345678901234567890.1234567891'),
		]);

		expect(owed.map((a) => a.total)).toEqual([amount('12345678901234567890.1234567891')]);
	});

	it('shows an account in credit as owing less than nothing', () => {
		const owed = Liabilities.accountsIn([
			balance('Liabilities', null, '500'),
			balance('Liabilities:Card', 'Liabilities', '500'),
		]);

		expect(owed.map((a) => a.total)).toEqual([amount('-500'), amount('-500')]);
	});
});

describe('the debts', () => {
	it('marks the accounts with nothing under them, the only ones that take payments', () => {
		expect(debts().map((d) => [d.account, d.leaf])).toEqual([
			['Liabilities', false],
			['Liabilities:Loans', false],
			['Liabilities:Loans:Home', true],
			['Liabilities:Loans:Car', true],
			['Liabilities:Card', true],
			['Liabilities:Loans:Old', true],
		]);
	});

	it('reads each account its terms whatever their case, blank when it has none', () => {
		const read = debts([
			loan('Liabilities:Loans:Home', { rate: 8.5, payment: '42,000', due: 5 }),
			{ account: 'liabilities:card', held: { kind: 'card', rate: 42, due: 20 } },
			{ account: 'Liabilities:Loans:Old', held: null },
		]);
		const debt = (account: string) => read.find((d) => d.account === account);

		expect(debt('Liabilities:Loans:Home')).toMatchObject({
			setUp: true,
			kind: 'loan',
			rate: 8.5,
			payment: amount('42000'),
			due: 5,
		});
		expect(debt('Liabilities:Card')).toMatchObject({
			setUp: true,
			rate: 42,
			payment: null,
			due: 20,
		});
		expect(debt('Liabilities:Loans:Old')).toMatchObject({ setUp: true, kind: null, rate: null });
		expect(debt('Liabilities:Loans:Car')).toMatchObject({
			setUp: false,
			kind: null,
			rate: null,
			payment: null,
			due: null,
			loan: null,
		});
	});

	it('reads a loan from a rate and a payment without its commas', () => {
		const [home] = debts(
			[
				{
					account: 'Liabilities:Loans:Home',
					held: { kind: 'loan', method: 'flat', rate: 9, payment: '12,500', tenure: 24 },
				},
			],
			[balance('Liabilities:Loans:Home', 'Liabilities', '-1000')],
		);

		expect(home?.loan).toEqual({
			rate: amount('9'),
			method: 'flat',
			payment: amount('12500'),
			months: 24,
		});
	});

	it('reads no loan without a rate, a payment, or the months of a flat loan', () => {
		const loanOf = (held: Held) =>
			debts([{ account: 'Liabilities:Card', held }]).find((d) => d.account === 'Liabilities:Card')
				?.loan;

		expect(loanOf({ kind: 'card', limit: '5000' })).toBeNull();
		expect(loanOf({ kind: 'loan', method: 'reducing', rate: 9 })).toBeNull();
		expect(loanOf({ kind: 'loan', method: 'reducing', payment: '1,000' })).toBeNull();
		expect(loanOf({ kind: 'loan', method: 'flat', rate: 9, payment: '1,000' })).toBeNull();
		expect(loanOf(null)).toBeNull();
	});
});

describe('the rows of the table', () => {
	const totals = [
		paid('Liabilities', '40000'),
		paid('Liabilities:Loans', '40000'),
		paid('Liabilities:Loans:Home', '30000'),
		paid('Liabilities:Loans:Car', '10000'),
	];

	it('leaves out the root and settled accounts that did not move, and gives each row what it drew and paid', () => {
		const rows = Liabilities.rowsFor(debts(), totals, false);

		expect(rows.map((r) => [r.account, r.owed, r.drawn, r.paid])).toEqual([
			['Liabilities:Loans', amount('300000'), amount('0'), amount('40000')],
			['Liabilities:Loans:Home', amount('250000'), amount('0'), amount('30000')],
			['Liabilities:Loans:Car', amount('50000'), amount('0'), amount('10000')],
			['Liabilities:Card', amount('25000'), amount('0'), amount('0')],
		]);
	});

	it('keeps a settled account that only drew, which a net of nothing would hide', () => {
		const rows = Liabilities.rowsFor(
			debts(),
			[paid('Liabilities:Loans:Old', '8000', '8000')],
			false,
		);

		expect(rows.find((r) => r.account === 'Liabilities:Loans:Old')).toMatchObject({
			owed: amount('0'),
			drawn: amount('8000'),
			paid: amount('8000'),
		});
	});

	it('keeps a settled account that moved in the period, as one paid off in it', () => {
		const rows = Liabilities.rowsFor(
			debts(),
			[...totals, paid('Liabilities:Loans:Old', '8000')],
			false,
		);

		expect(rows.map((r) => r.account)).toContain('Liabilities:Loans:Old');
	});

	it('treats a balance of 0.00 as settled', () => {
		const old = [balance('Liabilities:Old', 'Liabilities', '0.00')];

		expect(Liabilities.rowsFor(debts([], old), [], false)).toEqual([]);
	});

	it('brings back every settled account when asked', () => {
		expect(Liabilities.rowsFor(debts(), totals, true).map((r) => r.account)).toContain(
			'Liabilities:Loans:Old',
		);
	});
});

describe('the payments due in a span', () => {
	const terms = [
		loan('Liabilities:Loans:Home', { payment: '34,500', due: 5 }),
		loan('Liabilities:Loans:Car', { payment: '12,400', due: 10 }),
		card('liabilities:card', 31),
	];

	it('puts a payment on its due day of each month, a card paying what it owes and a loan its payment', () => {
		const dues = duesIn(debts(terms), { from: on('2026-11-08'), to: on('2026-12-31') });

		expect(dues.map((d) => [d.account, num(d.amount), d.on.toString()])).toEqual([
			['Liabilities:Loans:Home', 34500, '2026-12-05'],
			['Liabilities:Loans:Car', 12400, '2026-11-10'],
			['Liabilities:Loans:Car', 12400, '2026-12-10'],
			['Liabilities:Card', 25000, '2026-11-30'],
			['Liabilities:Card', 25000, '2026-12-31'],
		]);
	});

	it('counts a payment due on the first day and none after the last', () => {
		const dues = duesIn(debts(terms), { from: on('2026-11-05'), to: on('2026-11-09') });

		expect(dues.map((d) => d.on.toString())).toEqual(['2026-11-05']);
	});

	it('stops a loan at the payment that clears it, and says the interest in it', () => {
		const small = [balance('Liabilities:Loans:Home', 'Liabilities', '-1000')];
		const home = loan('Liabilities:Loans:Home', { payment: '30,000', due: 20, rate: 12 });
		const dues = duesIn(debts([home], small), { from: on('2026-11-08'), to: on('2027-12-31') });

		expect(dues.map((d) => [d.on.toString(), num(d.interest)])).toEqual([['2026-11-20', 10]]);
	});

	it('gives a loan in credit no dues', () => {
		const credit = [balance('Liabilities:Loans:Home', 'Liabilities', '30000')];
		const home = loan('Liabilities:Loans:Home', { payment: '30,000', due: 20, rate: 12 });

		expect(duesIn(debts([home], credit), { from: on('2026-11-08'), to: on('2027-12-31') })).toEqual(
			[],
		);
	});

	it('moves a due day of 31 to the last day of a short month', () => {
		const dues = duesIn(debts([card('Liabilities:Card', 31)]), {
			from: on('2026-11-30'),
			to: on('2026-12-31'),
		});

		expect(dues.map((d) => d.on.toString())).toEqual(['2026-11-30', '2026-12-31']);
	});

	it('leaves out groups, accounts with no due day or amount, and cards that owe nothing', () => {
		const left = debts([
			loan('Liabilities:Loans', { payment: '1', due: 5 }),
			loan('Liabilities:Loans:Home', { due: 5 }),
			loan('Liabilities:Loans:Car', { payment: '12,400' }),
			card('Liabilities:Loans:Old', 5),
			{ account: 'Liabilities:Card', held: null },
		]);

		expect(duesIn(left, { from: on('2026-11-08'), to: on('2026-12-31') })).toEqual([]);
	});
});

describe('the lines of the timeline', () => {
	const home = loan('Liabilities:Loans:Home', { rate: 12, payment: '30,000', due: 5 });
	const span = { from: on('2026-12-01'), to: on('2026-12-31') };

	it('gives each account its payments made and still due, in order of day, and leaves out the rest', () => {
		const owing = debts([home, loan('Liabilities:Loans:Car', { payment: '10,000', due: 10 })]);
		const lines = Liabilities.linesFor(
			owing,
			[
				made('Liabilities:Loans:Home', '2026-02-01', '30000'),
				made('Liabilities:Loans:Home', '2026-01-01', '30000'),
				made('Liabilities:Loans:Car', '2026-01-01', '0'),
				made('Liabilities:Loans', '2026-01-01', '60000'),
			],
			duesIn(owing, span),
			'month',
		);

		expect(lines.map((l) => [l.label, l.pins.map((p) => [p.at.toString(), p.past])])).toEqual([
			['Car', [['2026-12-01', false]]],
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

	it('pins what was paid in a bucket, not its net change, and nothing when no payment was made', () => {
		const lines = Liabilities.linesFor(
			debts(),
			[made('Liabilities:Card', '2026-01-01', '8000'), made('Liabilities:Card', '2026-02-01', '0')],
			[],
			'month',
		);

		expect(lines.map((l) => l.pins.map((p) => [p.at.toString(), p.amount]))).toEqual([
			[['2026-01-01', amount('8000')]],
		]);
	});

	it('splits each pin into principal and interest, from the balance before it', () => {
		const owing = debts([home]);
		const lines = Liabilities.linesFor(
			owing,
			[made('Liabilities:Loans:Home', '2026-01-01', '30000')],
			duesIn(owing, span),
			'month',
		);
		const [paidPin, duePin] = lines[0]?.pins ?? [];

		expect(num(paidPin?.interest)).toBeCloseTo(2772.28, 1);
		expect(num(duePin?.interest)).toBeCloseTo(2500);
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
			balance('Liabilities', null, '0'),
			balance('Liabilities:Loans:Home', 'Liabilities', '0'),
		];
		const lines = Liabilities.linesFor(
			debts([flat], cleared),
			[made('Liabilities:Loans:Home', '2026-01-01', '1000')],
			[],
			'month',
		);

		expect(num(lines[0]?.pins[0]?.interest)).toBeCloseTo(1000 * (0.12 / 1.12));
	});

	it('leaves interest out for a year of payments and for a loan that cannot tell', () => {
		const payments = [made('Liabilities:Loans:Home', '2026-01-01', '30000')];
		const yearly = Liabilities.linesFor(
			debts([home]),
			payments,
			duesIn(debts([home]), span),
			'year',
		);

		expect(yearly[0]?.pins.map((p) => p.interest)).toEqual([0n, 0n]);
		expect(Liabilities.linesFor(debts(), payments, [], 'month')[0]?.pins[0]?.interest).toBe(0n);
	});
});

describe('the estimates of the loans', () => {
	const home = loan('Liabilities:Loans:Home', { rate: 12, payment: '30,000' });
	const car = loan('Liabilities:Loans:Car', { rate: 12, payment: '10,000' });
	const day = on('2026-11-08');
	const only = (account: string, terms: Listed) =>
		debts(terms).filter((d) => d.account === account);
	const without = (account: string, terms: Listed) =>
		debts(terms).filter((d) => d.account !== account);

	it('adds up the interest a month and finds the month the last loan is paid off', () => {
		const loans = without('Liabilities:Card', [home, car]);

		expect(num(Liabilities.monthlyInterestOn(loans))).toBeCloseTo(3000);
		expect(Liabilities.payoffOf(loans, day)?.toString()).toBe('2027-08-01');
	});

	it('says nothing about when a loan ends that never clears', () => {
		const never = only('Liabilities:Loans:Home', [
			loan('Liabilities:Loans:Home', { rate: 12, payment: '100' }),
		]);

		expect(Liabilities.payoffOf(never, day)).toBeNull();
		expect(num(Liabilities.monthlyInterestOn(never))).toBeCloseTo(2500);
	});

	it('leaves out a card', () => {
		const loans = without('Liabilities:Loans:Car', [
			home,
			{ account: 'Liabilities:Card', held: { kind: 'card', limit: '90,000' } },
		]);

		expect(num(Liabilities.monthlyInterestOn(loans))).toBeCloseTo(2500);
		expect(Liabilities.payoffOf(loans, day)?.toString()).toBe('2027-08-01');
	});

	it('says nothing at all while a debt has no terms', () => {
		expect(Liabilities.monthlyInterestOn(debts([home]))).toBeNull();
		expect(Liabilities.payoffOf(debts([home]), day)).toBeNull();
		expect(Liabilities.monthlyInterestOn(debts())).toBeNull();
	});

	it('says nothing at all when a loan that owes has no rate', () => {
		const loans = without('Liabilities:Card', [
			home,
			loan('Liabilities:Loans:Car', { payment: '10,000' }),
		]);

		expect(Liabilities.monthlyInterestOn(loans)).toBeNull();
		expect(Liabilities.payoffOf(loans, day)).toBeNull();
	});

	it('ends a month sooner when this month’s payment is still to come', () => {
		const due = (d: number) =>
			only('Liabilities:Loans:Home', [
				loan('Liabilities:Loans:Home', { rate: 12, payment: '30,000', due: d }),
			]);

		expect(Liabilities.payoffOf(due(20), day)?.toString()).toBe('2027-07-01');
		expect(Liabilities.payoffOf(due(5), day)?.toString()).toBe('2027-08-01');
		expect(Liabilities.payoffOf(due(8), day)?.toString()).toBe('2027-07-01');
		expect(Liabilities.payoffOf(due(31), on('2026-11-30'))?.toString()).toBe('2027-07-01');
		expect(Liabilities.payoffOf(only('Liabilities:Loans:Home', [home]), day)?.toString()).toBe(
			'2027-08-01',
		);
	});
});

describe('the figures of the page', () => {
	it('reads what an account owes, and nothing for one that is not a debt', () => {
		expect(num(Liabilities.owedOn(debts(), 'Liabilities:Loans'))).toBe(300000);
		expect(num(Liabilities.owedOn(debts(), 'Liabilities'))).toBe(325000);
		expect(num(Liabilities.owedOn(debts(), 'Liabilities:Gone'))).toBe(0);
	});

	it('counts the payments made and the ones still to fall due', () => {
		const lines = [
			{ pins: [{ past: true }, { past: true }, { past: false }] },
			{ pins: [{ past: false }] },
		];

		expect(Liabilities.paymentsOn(lines)).toEqual({ made: 2, due: 2 });
		expect(Liabilities.paymentsOn([])).toEqual({ made: 0, due: 0 });
	});
});
