import {
	viewAccount,
	viewCounted,
	viewDeltas,
	viewGroup,
	viewLot,
	viewPosting,
	viewSuggestion,
	viewTransaction,
} from '#lib/endpoints/views.ts';
import { parseAmount } from '@rupea/shared/money.ts';
import { describe, expect, it } from 'vitest';

const location = { file: 'bank.rupea', line: 12 };

describe('viewing a transaction', () => {
	const transaction = {
		file: 'bank.rupea',
		line: 12,
		date: '2026-08-29',
		time: '18:45:30',
		description: 'Bought shares',
		comment: null,
		postings: [
			{
				account: 'Assets:Broker',
				quantity: {
					amount: '10.00',
					commodity: 'INFY',
					price: { amount: '1500.125', commodity: 'INR', kind: 'unit' as const },
					cost: { amount: '1400.00', commodity: 'INR', date: '2026-08-01' },
				},
			},
			{
				account: 'Assets:Bank',
				quantity: { amount: '-15001.25', commodity: 'INR', price: null, cost: null },
			},
		],
	};

	it('prints the quantities and cuts the time to the minute', () => {
		expect(viewTransaction(transaction)).toEqual({
			...transaction,
			time: '18:45',
			postings: [
				{
					account: 'Assets:Broker',
					quantity: '10.00 INFY {1400.00, 2026-08-01} @ 1500.125',
				},
				{ account: 'Assets:Bank', quantity: '-15001.25' },
			],
		});
	});

	it('leaves an untimed transaction without a time', () => {
		expect(viewTransaction({ ...transaction, time: null }).time).toBeNull();
	});

	it('keeps the role of each member of a group', () => {
		const member = { ...transaction, role: 'evidence' as const, counted: false };

		expect(viewGroup({ group: 'rent', members: [member] }).members).toMatchObject([
			{ role: 'evidence', counted: false, description: 'Bought shares', time: '18:45' },
		]);
	});

	it('prints both sides of a suggestion', () => {
		const suggestion = {
			fingerprint: 'f',
			confidence: 'duplicate' as const,
			group: null,
			ours: transaction,
			theirs: { ...transaction, time: null },
			links: [],
		};

		const viewed = viewSuggestion(suggestion);

		expect(viewed).toMatchObject({ fingerprint: 'f', confidence: 'duplicate', links: [] });
		expect([viewed.ours.time, viewed.theirs.time]).toEqual(['18:45', null]);
	});

	it('keeps whether a counted transaction counts', () => {
		const counted = viewCounted({ ...transaction, id: 't1', counted: false });

		expect(counted).toMatchObject({ id: 't1', counted: false, description: 'Bought shares' });
	});

	it('keys a posting by its transaction and position', () => {
		const listed = {
			transaction: 't1',
			position: 2,
			file: 'bank.rupea',
			line: 12,
			date: '2026-08-29',
			description: 'Groceries',
			account: 'Expenses:Food',
			quantity: { amount: '100.50', commodity: 'INR', price: null, cost: null },
		};
		expect(viewPosting(listed)).toEqual({
			key: 't1:2',
			transaction: 't1',
			file: 'bank.rupea',
			line: 12,
			date: '2026-08-29',
			description: 'Groceries',
			account: 'Expenses:Food',
			quantity: '100.50',
		});
	});
});

describe('viewing an account', () => {
	const holding = {
		commodity: 'INFY',
		hasLots: true,
		units: '7.00',
		price: { amount: '1800.00', commodity: 'INR' },
		value: '12600.00',
		paid: '10900.00',
		gain: '1700.00',
	};
	const account = {
		account: 'Assets:Broker',
		parent: 'Assets',
		holdings: [holding],
		total: '12600.00',
		cost: '10900.00',
		gain: '1700.00',
		unpriced: 0,
	};

	it('prints a holding as the page shows it', () => {
		expect(viewAccount(account)).toEqual({
			...account,
			total: parseAmount('12600'),
			cost: parseAmount('10900'),
			gain: parseAmount('1700'),
			holdings: [
				{
					commodity: 'INFY',
					hasLots: true,
					units: '7.00 INFY',
					cost: '10900.00',
					price: '1800.00',
					value: '12600.00',
					gain: '1700.00',
				},
			],
		});
	});

	it('leaves rupees without a count of units, and what has no price without a value', () => {
		const cash = { ...holding, commodity: 'INR', price: null, value: null, paid: null, gain: null };
		const viewed = viewAccount({ ...account, holdings: [cash], cost: null, gain: null });
		expect(viewed).toMatchObject({ cost: null, gain: null });
		expect(viewed.holdings).toEqual([
			{
				commodity: 'INR',
				hasLots: true,
				units: null,
				cost: null,
				price: null,
				value: null,
				gain: null,
			},
		]);
	});
});

describe('viewing a lot', () => {
	const sale = {
		location: { file: 'bank.rupea', line: 20 },
		date: '2026-09-01',
		kind: 'sale' as const,
		units: '3.00',
		price: { amount: '1800.00', commodity: 'INR' },
		gain: { amount: '300.00', commodity: 'INR' },
	};
	const lot = {
		location,
		date: '2026-08-29',
		origin: 'buy' as const,
		from: null,
		units: '10.00',
		remaining: '7.00',
		cost: { amount: '1700.00', commodity: 'INR' },
		disposals: [sale],
	};

	it('flattens the lot and each disposal from it for the page', () => {
		expect(viewLot(lot)).toEqual({
			file: 'bank.rupea',
			line: 12,
			date: '2026-08-29',
			origin: 'buy',
			from: null,
			units: '10.00',
			remaining: '7.00',
			cost: '1700.00',
			disposals: [
				{
					file: 'bank.rupea',
					line: 20,
					date: '2026-09-01',
					kind: 'sale' as const,
					units: '3.00',
					price: '1800.00',
					gain: '300.00',
				},
			],
		});
	});

	it('leaves a disposal without a price or gain when it had none', () => {
		const gift = { ...sale, kind: 'gift' as const, price: null, gain: null };
		expect(viewLot({ ...lot, disposals: [gift] }).disposals).toMatchObject([
			{ kind: 'gift', price: null, gain: null },
		]);
	});

	it('prints a price in another commodity beside it', () => {
		const dollars = { ...sale, price: { amount: '20.00', commodity: 'USD' } };
		expect(viewLot({ ...lot, disposals: [dollars] }).disposals[0]?.price).toBe('20.00 USD');
	});
});

describe('viewing what flowed', () => {
	it('reads the amounts exact and the days as days', () => {
		const flow = { amount: '-50.00', inflow: '0.00', outflow: '50.00', unpriced: 0 };
		const deltas = {
			from: '2026-08-01',
			to: '2026-08-31',
			bucket: 'month' as const,
			buckets: ['2026-08-01'],
			totals: [{ account: 'Expenses:Food', parent: 'Expenses', ...flow }],
			deltas: [{ account: 'Expenses:Food', bucket: '2026-08-01', ...flow }],
		};
		const viewed = viewDeltas(deltas);
		expect(viewed.from).toEqual(Temporal.PlainDate.from('2026-08-01'));
		expect(viewed.buckets).toEqual([Temporal.PlainDate.from('2026-08-01')]);
		expect(viewed.totals[0]).toMatchObject({
			amount: parseAmount('-50'),
			outflow: parseAmount('50'),
		});
		expect(viewed.deltas[0]?.bucket).toEqual(Temporal.PlainDate.from('2026-08-01'));
	});
});
