import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import { parse, parseTree } from '#services/ledger/domain/parser.ts';
import { toNode } from '#services/ledger/domain/nodes.ts';
import { print } from '#services/ledger/domain/printer.ts';
import {
	Feed,
	type RupeaLedgerFile,
	type RupeaTransaction,
} from '#services/ledger/domain/types.ts';
import { describe, expect, it } from 'vitest';

const amount = (t: string) => parseAmount(t) as Amount;

const transactions: RupeaTransaction[] = [
	{
		location: { file: 'a.rupea', line: 1 },
		date: Temporal.PlainDate.from('2026-08-29'),
		time: Temporal.PlainTime.from('18:45'),
		description: 'Groceries',
		metadata: {},
		comment: null,
		postings: [
			{
				account: 'Expenses:Food',
				amount: amount('100.5'),
				commodity: 'INR',
				price: null,
				cost: null,
				balance: null,
				metadata: {},
				comment: null,
			},
			{
				account: 'Assets:Bank',
				amount: amount('-100.5'),
				commodity: 'INR',
				price: null,
				cost: null,
				balance: null,
				metadata: {},
				comment: null,
			},
		],
	},
	{
		location: { file: 'a.rupea', line: 5 },
		date: Temporal.PlainDate.from('2026-08-30'),
		time: null,
		description: 'Salary for August',
		metadata: {},
		comment: null,
		postings: [
			{
				account: 'Assets:Bank',
				amount: amount('-0.000001'),
				commodity: 'INR',
				price: null,
				cost: null,
				balance: null,
				metadata: {},
				comment: null,
			},
			{
				account: 'Income:Salary',
				amount: amount('0.000001'),
				commodity: 'INR',
				price: null,
				cost: null,
				balance: null,
				metadata: {},
				comment: null,
			},
		],
	},
];

const ledger = (t: RupeaTransaction[]): RupeaLedgerFile => ({
	metadata: {},
	transactions: t,
	prices: [],
	links: [],
});

const annotated: RupeaLedgerFile = {
	metadata: { statement: ['hdfc-card-oct-2026.pdf'] },
	transactions: [
		{
			location: { file: 'a.rupea', line: 3 },
			date: Temporal.PlainDate.from('2026-10-01'),
			time: null,
			description: 'Amazon order 402-123',
			metadata: { group: ['2026-10-01-amazon-otter'], ref: ['402-1', '402-2'] },
			comment: 'one order, two items',
			postings: [
				{
					account: 'Liabilities:Card',
					amount: amount('-1299'),
					commodity: 'INR',
					price: null,
					cost: null,
					balance: null,
					metadata: {},
					comment: null,
				},
				{
					account: 'Expenses:Books',
					amount: amount('499'),
					commodity: 'INR',
					price: null,
					cost: null,
					balance: null,
					metadata: { tags: ['gift, 80c'] },
					comment: 'for Asha',
				},
				{
					account: 'Expenses:Electronics',
					amount: amount('800'),
					commodity: 'INR',
					price: null,
					cost: null,
					balance: null,
					metadata: {},
					comment: null,
				},
			],
		},
	],
	prices: [],
	links: [],
};

const printed = (t: RupeaLedgerFile) => print(defaultConfiguration.ledger, toNode(t));
const reprinted = (content: string) =>
	print(
		defaultConfiguration.ledger,
		parseTree(defaultConfiguration.ledger, { key: 'a.rupea', content }),
	);

describe('printing a ledger', () => {
	it('writes .rupea text in the first configured formats, amounts aligned', () => {
		expect(printed(ledger(transactions))).toBe(
			[
				'2026-08-29 18:45 Groceries',
				'\tExpenses:Food  100.50',
				'\tAssets:Bank',
				'',
				'2026-08-30 Salary for August',
				'\tAssets:Bank',
				'\tIncome:Salary  0.000001',
				'',
			].join('\n'),
		);
	});

	it('spells every amount unless exactly one posting is outgoing', () => {
		const spelled = (postings: [string, string][]) =>
			printed(
				ledger([
					{
						...transactions[0]!,
						postings: postings.map(([account, a]) => ({
							account,
							amount: amount(a),
							commodity: 'INR',
							price: null,
							cost: null,
							balance: null,
							metadata: {},
							comment: null,
						})),
					},
				]),
			)
				.split('\n')
				.slice(1, -1);
		expect(
			spelled([
				['A', '-1'],
				['B', '-2'],
				['C', '3'],
			]),
		).toEqual(['\tA  -1.00', '\tB  -2.00', '\tC  3.00']);
		expect(
			spelled([
				['A', '0'],
				['B', '0'],
			]),
		).toEqual(['\tA  0.00', '\tB  0.00']);
	});

	it('reads back as what it wrote', () => {
		const content = printed(ledger(transactions));
		expect(parse(defaultConfiguration.ledger, { key: 'a.rupea', content })).toEqual({
			metadata: {},
			prices: [],
			links: [],
			succeeded: transactions,
			failed: [],
		});
	});

	it("writes comments and metadata under what they belong to, a posting's a level deeper", () => {
		expect(printed(annotated)).toBe(
			[
				'- statement: hdfc-card-oct-2026.pdf',
				'',
				'2026-10-01 Amazon order 402-123',
				'\t; one order, two items',
				'\t- group: 2026-10-01-amazon-otter',
				'\t- ref: 402-1',
				'\t- ref: 402-2',
				'\tLiabilities:Card',
				'\tExpenses:Books        499.00',
				'\t\t; for Asha',
				'\t\t- tags: gift, 80c',
				'\tExpenses:Electronics  800.00',
				'',
			].join('\n'),
		);
	});

	it('reads metadata and comments back as what it wrote', () => {
		const content = printed(annotated);
		expect(parse(defaultConfiguration.ledger, { key: 'a.rupea', content })).toEqual({
			metadata: annotated.metadata,
			prices: [],
			links: [],
			succeeded: annotated.transactions,
			failed: [],
		});
	});

	it('writes a balance after the amount, and reads it back', () => {
		const [groceries, salary] = transactions;
		const asserted = ledger([
			{
				...groceries!,
				postings: groceries!.postings.map((p) => ({ ...p, balance: amount('1899.5') })),
			},
			salary!,
		]);
		const content = printed(asserted);

		expect(content.split('\n').slice(1, 3)).toEqual([
			'\tExpenses:Food  100.50 = 1899.50',
			'\tAssets:Bank    = 1899.50',
		]);
		expect(parse(defaultConfiguration.ledger, { key: 'a.rupea', content }).succeeded).toEqual(
			asserted.transactions,
		);
	});

	it('writes a lot cost between the amount and the price, and reads it back', () => {
		const content = [
			'2026-10-01 Sell INFY',
			'\tAssets:Zerodha  -4.00 INFY {1500.00} @ 1700.00',
			'\tAssets:Zerodha  -2.00 INFY {900.00, 2019-03-04} @ 1700.00',
			'\tAssets:Bank     10200.00',
			'\tIncome:Gains    -2400.00',
			'',
		].join('\n');

		expect(parse(defaultConfiguration.ledger, { key: 'a.rupea', content }).failed).toEqual([]);
		expect(reprinted(content)).toBe(content);
	});

	it('spells out commodities and prices, and reads them back', () => {
		const content = [
			'2026-10-01 Buy AAPL',
			'\tAssets:IBKR       10.00 AAPL @ 180.25 USD = 30.00 AAPL',
			'\tAssets:IBKR:Cash  -1802.50 USD',
			'',
			'2026-10-02 Fund IBKR',
			'\tAssets:IBKR:Cash  100.00 USD @@ 8350.00',
			'\tAssets:HDFC       -8350.00',
			'',
		].join('\n');

		expect(parse(defaultConfiguration.ledger, { key: 'a.rupea', content }).failed).toEqual([]);
		expect(reprinted(content)).toBe(content);
	});

	it('writes market prices and links where they were, and reads them back', () => {
		const content = [
			'P 2026-10-17 INFY 1820.00',
			'',
			'2026-10-01 Buy INFY',
			'\tAssets:Zerodha  10.00 INFY @ 1500.00',
			'\tAssets:Bank     -15000.00',
			'',
			'P 2026-10-17 AAPL 230.50 USD',
			'P * HNFI mfapi:120716',
			'; a comment under a P line is its own',
			'P 2026-01-01 HNFI yahoo:HDFCNIFTY.NS',
			'',
		].join('\n');
		const parsed = parse(defaultConfiguration.ledger, { key: 'a.rupea', content });

		expect(parsed.failed).toEqual([]);
		expect(parsed.prices).toHaveLength(2);
		expect(parsed.links).toHaveLength(2);
		expect(reprinted(content)).toBe(content);
	});

	it('writes prices and links after the transactions of a file made from a ledger', () => {
		const content = printed({
			...ledger(transactions.slice(0, 1)),
			prices: [
				{
					location: { file: 'a.rupea', line: 1 },
					date: Temporal.PlainDate.from('2026-10-17'),
					commodity: 'INFY',
					price: { amount: amount('1820'), commodity: 'INR' },
				},
			],
			links: [
				{
					location: { file: 'a.rupea', line: 2 },
					since: null,
					commodity: 'HNFI',
					feed: Feed.Mfapi,
					symbol: '120716',
				},
			],
		});
		expect(content.split('\n').slice(-4)).toEqual([
			'',
			'P 2026-10-17 INFY 1820.00',
			'P * HNFI mfapi:120716',
			'',
		]);
	});

	it('writes P lines in a row as one block', () => {
		const content = ['P 2026-10-17 INFY 1820.00', 'P 2026-10-18 INFY 1830.00', ''].join('\n');

		expect(
			reprinted(['P 2026-10-17 INFY 1820.00', '', 'P 2026-10-18 INFY 1830.00', ''].join('\n')),
		).toBe(content);
	});

	it('writes a time in the first configured format that holds it', () => {
		const at = (time: string) =>
			printed(ledger([{ ...transactions[0]!, time: Temporal.PlainTime.from(time) }])).split(
				'\n',
			)[0];

		expect(at('18:45')).toBe('2026-08-29 18:45 Groceries');
		expect(at('18:45:30')).toBe('2026-08-29 18:45:30 Groceries');
	});

	it('follows the configuration', () => {
		const cfg = { dateFormats: ['d MMM yyyy'], timeFormats: ['h:mm a'] };
		expect(print(cfg, toNode(ledger(transactions.slice(0, 1))))).toMatch(
			/^29 Aug 2026 6:45 PM Groceries\n/,
		);
	});

	it('writes nothing for no transactions', () => {
		expect(printed(ledger([]))).toBe('');
	});
});
