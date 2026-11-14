import {
	viewCounted,
	viewDaily,
	viewDeltas,
	viewHoldings,
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

describe('viewing what accounts held', () => {
	const infy = {
		commodity: 'INFY',
		bucket: '2026-10-21',
		unpriced: 0,
		units: '7.00',
		price: { amount: '1800.00', commodity: 'INR' },
		value: '12600.00',
		cost: '10900.00',
	};
	const cash = {
		commodity: 'INR',
		bucket: '2026-10-21',
		unpriced: 0,
		units: '500.00',
		value: '500.00',
		cost: '0.00',
	};
	const held = (rows: object[]) =>
		({ from: '2026-10-21', to: '2026-10-21', base: 'INR', rows }) as never;
	const parents = { Assets: null, 'Assets:Broker': 'Assets', 'Assets:Bank': 'Assets' };

	it('shows a holding as the page does, with the gain its lots made', () => {
		const viewed = viewHoldings(held([{ account: 'Assets:Broker', ...infy }]), parents);

		expect(viewed).toEqual([
			{
				account: 'Assets:Broker',
				parent: 'Assets',
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
				total: parseAmount('12600'),
				cost: parseAmount('10900'),
				gain: parseAmount('1700'),
				unpriced: 0,
			},
		]);
	});

	it('gives a parent only what it holds itself, and the total of all under it', () => {
		const rows = [
			{ account: 'Assets', ...cash, units: '500.00', value: '500.00' },
			{ account: 'Assets:Bank', ...cash },
		];
		const [assets, bank] = viewHoldings(held(rows), parents);

		expect(assets?.holdings).toEqual([]);
		expect(assets?.total).toBe(parseAmount('500'));
		expect(bank?.holdings).toEqual([
			{
				commodity: 'INR',
				hasLots: false,
				units: null,
				cost: null,
				price: null,
				value: '500.00',
				gain: null,
			},
		]);
		expect(bank).toMatchObject({ cost: null, gain: null });
	});

	it('totals cost and gain over only what has both a cost and a price', () => {
		const rows = [
			{ account: 'Assets', ...infy },
			{ account: 'Assets', ...cash },
			{
				account: 'Assets',
				commodity: 'TCS',
				bucket: infy.bucket,
				unpriced: 1,
				units: '3.00',
				value: '0.00',
				cost: '9000.00',
			},
		];
		const [assets] = viewHoldings(held(rows), { Assets: null });

		expect(assets).toMatchObject({
			cost: parseAmount('10900'),
			gain: parseAmount('1700'),
			unpriced: 1,
		});
	});

	it('leaves a value out where a commodity has no price, and counts it', () => {
		const lost = {
			account: 'Assets:Broker',
			...infy,
			unpriced: 1,
			price: undefined,
			value: '0.00',
		};
		const [broker] = viewHoldings(held([lost]), parents);

		expect(broker?.holdings[0]).toMatchObject({ value: null, gain: null });
		expect(broker?.unpriced).toBe(1);
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
	const flow = { commodity: null, value: '-50.00', inflow: '0.00', outflow: '50.00', unpriced: 0 };
	const parents = { Expenses: null, 'Expenses:Food': 'Expenses' };

	it('reads the amounts exact and the buckets as days', () => {
		const deltas = {
			from: '2026-08-01',
			to: '2026-09-30',
			base: 'INR',
			rows: [
				{ account: 'Expenses:Food', bucket: '2026-08', ...flow },
				{ account: 'Expenses:Food', bucket: '2026-09', ...flow },
			],
		};
		const viewed = viewDeltas(deltas, { bucket: 'month', parents });
		expect(viewed.from).toEqual(Temporal.PlainDate.from('2026-08-01'));
		expect(viewed.buckets.map(String)).toEqual(['2026-08-01', '2026-09-01']);
		expect(viewed.deltas.map((d) => d.bucket.toString())).toEqual(['2026-08-01', '2026-09-01']);
	});

	it('adds up each account drawn over its buckets, under the one it is drawn under', () => {
		const deltas = {
			from: '2026-08-01',
			to: '2026-09-30',
			base: 'INR',
			rows: [
				{ account: 'Expenses:Food', bucket: '2026-08', ...flow },
				{ account: 'Expenses:Food', bucket: '2026-09', ...flow },
				{ account: 'Expenses:Hidden', bucket: '2026-09', ...flow },
			],
		};
		const { totals } = viewDeltas(deltas, { bucket: 'month', parents });
		expect(totals).toHaveLength(1);
		expect(totals[0]).toMatchObject({
			account: 'Expenses:Food',
			parent: 'Expenses',
			amount: parseAmount('-100'),
			inflow: parseAmount('0'),
			outflow: parseAmount('100'),
		});
	});

	it('dates a calendar day by itself, and leaves out one the span does not touch', () => {
		const deltas = {
			from: '2026-08-20',
			to: '2026-09-10',
			base: 'INR',
			rows: [
				{ account: 'Expenses:Food', bucket: '2026-09-03', ...flow },
				{ account: 'Expenses:Food', bucket: '2026-10-03', ...flow },
			],
		};
		const { deltas: rows } = viewDeltas(deltas, { bucket: 'day', parents });
		expect(rows.map((d) => d.bucket.toString())).toEqual(['2026-09-03']);
	});

	it('gives each day of the month, with none spent where there is no row', () => {
		const daily = viewDaily(
			{
				from: '2026-01-01',
				to: '2026-01-31',
				base: 'INR',
				rows: [{ account: 'Expenses', bucket: '5', ...flow }],
			},
			'Expenses',
		);
		expect(daily).toHaveLength(31);
		expect(daily[4]).toEqual({ day: 5, amount: '-50.00', unpriced: 0 });
		expect(daily[5]).toEqual({ day: 6, amount: '0', unpriced: 0 });
		expect(viewDaily(undefined, 'Expenses')[0]).toEqual({ day: 1, amount: '0', unpriced: 0 });
	});
});
