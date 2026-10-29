import {
	viewAccount,
	viewCounted,
	viewGroup,
	viewLot,
	viewPosting,
	viewTransaction,
	viewWorth,
} from '#lib/endpoints/views.ts';
import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { GroupRole } from '#services/ledger/domain/groups.ts';
import {
	DisposalKind,
	LotOrigin,
	PriceKind,
	type RupeaTransaction,
} from '#services/ledger/domain/types.ts';
import { describe, expect, it } from 'vitest';

const amount = (t: string) => parseAmount(t) as Amount;

const day = Temporal.PlainDate.from('2026-08-29');
const location = { file: 'bank.rupea', line: 12 };

describe('viewing a transaction', () => {
	const transaction: RupeaTransaction = {
		location: { file: 'bank.rupea', line: 12 },
		date: Temporal.PlainDate.from('2026-08-29'),
		time: Temporal.PlainTime.from('18:45:30'),
		description: 'Bought shares',
		metadata: {},
		comment: null,
		postings: [
			{
				account: 'Assets:Broker',
				amount: amount('10'),
				commodity: 'INFY',
				price: { kind: PriceKind.Unit, amount: amount('1500.125'), commodity: 'INR' },
				cost: null,
				balance: null,
				metadata: {},
				comment: null,
			},
			{
				account: 'Assets:Bank',
				amount: amount('-15001.25'),
				commodity: 'INR',
				price: null,
				cost: null,
				balance: null,
				metadata: {},
				comment: null,
			},
		],
	};

	it('flattens it into plain text for the page', () => {
		expect(viewTransaction(transaction)).toEqual({
			file: 'bank.rupea',
			line: 12,
			date: '2026-08-29',
			time: '18:45',
			description: 'Bought shares',
			comment: null,
			postings: [
				{ account: 'Assets:Broker', quantity: '10.00 INFY @ 1500.125' },
				{ account: 'Assets:Bank', quantity: '-15001.25' },
			],
		});
	});

	it('shows a total price with @@', () => {
		const [first] = transaction.postings;
		const priced = {
			...transaction,
			postings: [
				{ ...first!, price: { kind: PriceKind.Total, amount: amount('5'), commodity: 'USD' } },
			],
		};
		expect(viewTransaction(priced).postings[0]?.quantity).toBe('10.00 INFY @@ 5.00 USD');
	});

	it('leaves an untimed transaction without a time', () => {
		expect(viewTransaction({ ...transaction, time: null }).time).toBeNull();
	});
});

describe('viewing what a transaction is listed as', () => {
	const transaction: RupeaTransaction = {
		location,
		date: day,
		time: null,
		description: 'Groceries',
		metadata: {},
		comment: null,
		postings: [],
	};

	it('keeps whether a counted transaction counts', () => {
		expect(viewCounted({ ...transaction, id: 't1', counted: false })).toMatchObject({
			id: 't1',
			counted: false,
			description: 'Groceries',
		});
	});

	it('keeps the role of each member of a group', () => {
		const member = { ...transaction, id: 't1', role: GroupRole.Evidence, counted: false };
		expect(viewGroup({ group: 'rent', members: [member] }).members).toMatchObject([
			{ role: 'evidence', counted: false, description: 'Groceries' },
		]);
	});

	it('keys a posting by its transaction and position', () => {
		const posting = {
			account: 'Expenses:Food',
			amount: amount('100.5'),
			commodity: 'INR',
			price: null,
			cost: null,
			balance: null,
			metadata: {},
			comment: null,
		};
		const listed = {
			transaction: 't1',
			position: 2,
			location,
			date: day,
			description: 'Groceries',
			posting,
		};
		expect(viewPosting(listed)).toEqual({
			key: 't1:2',
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
		account: 'Assets:Broker',
		commodity: 'INFY',
		units: amount('7'),
		cost: { amount: amount('10900'), commodity: 'INR' },
		hasLots: true,
		price: { amount: amount('1800'), commodity: 'INR' },
		value: amount('12600'),
		paid: amount('10900'),
		gain: amount('1700'),
	};
	const account = {
		account: 'Assets:Broker',
		parent: 'Assets',
		holdings: [holding],
		total: amount('12600'),
		cost: amount('10900'),
		gain: amount('1700'),
		unpriced: 0,
	};

	it('shows amounts as text', () => {
		expect(viewAccount(account)).toEqual({
			account: 'Assets:Broker',
			parent: 'Assets',
			total: '12600.00',
			cost: '10900.00',
			gain: '1700.00',
			unpriced: 0,
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

describe('viewing net worth', () => {
	it('shows each side and part as text', () => {
		const worth = {
			day,
			assets: amount('500'),
			liabilities: amount('-200'),
			worth: amount('300'),
			parts: [
				{ account: 'Assets:Bank', commodity: null, amount: amount('500') },
				{ account: 'Assets:Bank', commodity: 'USD', amount: amount('-200') },
			],
			unpriced: 1,
		};
		expect(viewWorth(worth)).toEqual({
			day: '2026-08-29',
			assets: '500.00',
			liabilities: '-200.00',
			worth: '300.00',
			parts: [
				{ account: 'Assets:Bank', commodity: null, amount: '500.00' },
				{ account: 'Assets:Bank', commodity: 'USD', amount: '-200.00' },
			],
			unpriced: 1,
		});
	});
});

describe('viewing a lot', () => {
	const sale = {
		location: { file: 'bank.rupea', line: 20 },
		date: Temporal.PlainDate.from('2026-09-01'),
		kind: DisposalKind.Sale,
		units: amount('3'),
		price: { amount: amount('1800'), commodity: 'INR' },
		gain: { amount: amount('300'), commodity: 'INR' },
	};
	const lot = {
		location,
		date: day,
		origin: LotOrigin.Buy,
		from: null,
		units: amount('10'),
		remaining: amount('7'),
		cost: { amount: amount('1700'), commodity: 'INR' },
		disposals: [sale],
	};

	it('shows the lot and each disposal from it as text', () => {
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
					kind: 'sale',
					units: '3.00',
					price: '1800.00',
					gain: '300.00',
				},
			],
		});
	});

	it('leaves a disposal without a price or gain when it had none', () => {
		const gift = { ...sale, kind: DisposalKind.Gift, price: null, gain: null };
		expect(viewLot({ ...lot, disposals: [gift] }).disposals).toMatchObject([
			{ kind: 'gift', price: null, gain: null },
		]);
	});
});
