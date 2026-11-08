import { describe, expect, it } from 'vitest';
import { linesOf, owedOf, rowsOf } from '#lib/web/shared/liabilities.ts';

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

describe('the payments on the timeline', () => {
	const owed = owedOf(ACCOUNTS);

	it('draws a circle for each bucket an account was paid down in, for the accounts that hold the debt and not the groups', () => {
		const lines = linesOf(
			[
				{ account: 'Liabilities:Loans', bucket: '2026-03-01', amount: '12000' },
				{ account: 'Liabilities:Loans:Home', bucket: '2026-03-01', amount: '10000' },
				{ account: 'Liabilities:Loans:Home', bucket: '2026-04-01', amount: '10000' },
				{ account: 'Liabilities:Loans:Car', bucket: '2026-03-01', amount: '2000' },
			],
			owed,
		);

		expect(lines).toEqual([
			{
				key: 'Liabilities:Loans:Car',
				label: 'Car',
				circles: [{ bucket: '2026-03-01', paid: 2000 }],
			},
			{
				key: 'Liabilities:Loans:Home',
				label: 'Home',
				circles: [
					{ bucket: '2026-03-01', paid: 10000 },
					{ bucket: '2026-04-01', paid: 10000 },
				],
			},
		]);
	});

	it('draws one row for a loan under a group nothing is posted to, which listAccounts leaves out', () => {
		const alone = owedOf([
			held('Liabilities', null, '-250000'),
			held('Liabilities:Loans:Home', 'Liabilities', '-250000'),
		]);

		const lines = linesOf(
			[
				{ account: 'Liabilities:Loans', bucket: '2026-03-01', amount: '10000' },
				{ account: 'Liabilities:Loans:Home', bucket: '2026-03-01', amount: '10000' },
			],
			alone,
		);

		expect(lines.map((l) => l.key)).toEqual(['Liabilities:Loans:Home']);
	});

	it('leaves out a bucket where the debt grew', () => {
		const lines = linesOf(
			[
				{ account: 'Liabilities:Card', bucket: '2026-03-01', amount: '-9000' },
				{ account: 'Liabilities:Card', bucket: '2026-04-01', amount: '9000' },
			],
			owed,
		);

		expect(lines).toEqual([
			{ key: 'Liabilities:Card', label: 'Card', circles: [{ bucket: '2026-04-01', paid: 9000 }] },
		]);
	});
});
