import { describe, expect, it } from 'vitest';
import { tileOf } from '#lib/web/shared/treemap.ts';

const rupees = (value: string | null, commodity = 'INR') => ({ commodity, value });

const rows = [
	{ account: 'Assets', parent: null, total: '950', holdings: [] },
	{ account: 'Assets:Bank', parent: 'Assets', total: '600', holdings: [rupees('600')] },
	{
		account: 'Assets:Broker',
		parent: 'Assets',
		total: '400',
		holdings: [rupees('300', 'INFY'), rupees('100', 'TCS'), rupees(null, 'XYZ')],
	},
	{ account: 'Assets:Loan', parent: 'Assets', total: '-50', holdings: [rupees('-50')] },
	{ account: 'Liabilities', parent: null, total: '-500', holdings: [] },
	{ account: 'Liabilities:Card', parent: 'Liabilities', total: '-500', holdings: [rupees('-500')] },
];

type Shape = { label: string; amount: number; tiles: Shape[] };

const shape = (t: Shape): unknown => [t.label, t.amount, t.tiles.map(shape)];

describe('the tiles', () => {
	it('nest the accounts under one, then their holdings when they have several, without what has no size', () => {
		expect(shape(tileOf(rows, 'Assets'))).toEqual([
			'Assets',
			1000,
			[
				['Bank', 600, []],
				[
					'Broker',
					400,
					[
						['INFY', 300, []],
						['TCS', 100, []],
					],
				],
			],
		]);
	});

	it('count owing the way the account runs, so it is drawn too', () => {
		expect(shape(tileOf(rows, 'Liabilities'))).toEqual(['Liabilities', 500, [['Card', 500, []]]]);
	});
});
