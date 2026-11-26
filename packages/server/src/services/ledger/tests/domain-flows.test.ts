import { dayNumberOf } from '#lib/server/shared/dates.ts';
import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import type { Row } from '#services/ledger/domain/deltas.ts';
import { flowsOf } from '#services/ledger/domain/flows.ts';
import { parentsOf } from '#services/ledger/domain/taxonomy.ts';
import { describe, expect, it } from 'vitest';

const DAY = dayNumberOf('2025-01-01');

const amount = (text: string) => parseAmount(text) ?? (0n as Amount);

const posting = (p: {
	account: string;
	commodity?: string;
	unpriced?: number;
	value?: Amount;
	transaction?: string;
	position?: number;
}): Row => ({
	commodity: 'INR',
	bucket: '2025-01-01',
	unpriced: 0,
	value: amount('0'),
	transaction: 't1',
	position: 0,
	...p,
});

const rolled = (rows: Row[]): Row[] =>
	Object.values(
		rows.reduce<Record<string, Row>>((totals, r) => {
			for (const account of parentsOf(r.account)) {
				const total = (totals[account] ??= { ...r, account, unpriced: 0, value: 0n as Amount });
				total.unpriced += r.unpriced;
				total.value = ((total.value ?? 0n) + (r.value ?? 0n)) as Amount;
			}

			return totals;
		}, {}),
	);

const summary = (deltas: Row[], earning: Row[]) =>
	flowsOf({ deltas: rolled(deltas), earning, base: 'INR' })
		.map((f) => [f.account, f.day, f.amount, f.unpriced])
		.toSorted(([a], [b]) => String(a).localeCompare(String(b)));

describe('flowsOf', () => {
	it('gives nothing for a transaction whose earning posting has no Assets one beside it', () => {
		expect(summary([], [posting({ account: 'Income:Interest', value: amount('-5') })])).toEqual([]);
	});

	it('takes interest out of what flowed into the account that received it', () => {
		const bank = posting({ account: 'Assets:Bank', value: amount('100') });
		const interest = posting({ account: 'Income:Interest', value: amount('-100'), position: 1 });

		expect(summary([bank], [bank, interest])).toEqual([
			['Assets', DAY, 0n, 0],
			['Assets:Bank', DAY, 0n, 0],
		]);
	});

	it('shares income between what is held other than the base, the first taking the rest', () => {
		const postings = [
			posting({ account: 'Assets:A', value: amount('10'), commodity: 'INFY' }),
			posting({ account: 'Assets:B', value: amount('10'), commodity: 'INFY', position: 1 }),
			posting({ account: 'Assets:Bank', value: amount('1'), position: 2 }),
			posting({ account: 'Income:Dividends', value: amount('-0.0000000003'), position: 3 }),
		];

		expect(summary(postings.slice(0, 3), postings)).toEqual([
			['Assets', DAY, amount('21') - 3n, 0],
			['Assets:A', DAY, amount('10') - 2n, 0],
			['Assets:B', DAY, amount('10') - 1n, 0],
			['Assets:Bank', DAY, amount('1'), 0],
		]);
	});

	it('takes the base from the ledger, so rupees are held in a ledger based in dollars', () => {
		const postings = [
			posting({ account: 'Assets:A', value: amount('10') }),
			posting({ account: 'Assets:Bank', value: amount('1'), commodity: 'USD', position: 1 }),
			posting({ account: 'Income:Interest', value: amount('-1'), commodity: 'USD', position: 2 }),
		];
		const flows = flowsOf({ deltas: rolled(postings.slice(0, 2)), earning: postings, base: 'USD' });

		expect(flows.filter((f) => f.account === 'Assets:A').map((f) => f.amount)).toEqual([
			amount('9'),
		]);
	});

	it('leaves a posting unpriced when its share cannot be known', () => {
		const bank = posting({ account: 'Assets:Bank', value: amount('5') });
		const interest = posting({ account: 'Income:Interest', unpriced: 1, position: 1 });

		expect(summary([bank], [bank, interest])).toEqual([
			['Assets', DAY, 0n, 1],
			['Assets:Bank', DAY, 0n, 1],
		]);
	});

	it('adds a transaction’s flows to what the deltas had for the same account and day', () => {
		const earlier = posting({
			account: 'Assets:Bank',
			value: amount('50'),
			unpriced: 1,
			transaction: 't0',
		});
		const bank = posting({ account: 'Assets:Bank', value: amount('100') });
		const interest = posting({ account: 'Income:Interest', value: amount('-30'), position: 1 });

		expect(summary([earlier, bank], [bank, interest])).toEqual([
			['Assets', DAY, amount('120'), 1],
			['Assets:Bank', DAY, amount('120'), 1],
		]);
	});
});
