import { describe, expect, it } from 'vitest';
import { boxesOf, tileOf, type Box } from '#lib/web/shared/treemap.ts';

const rupees = (value: string | null, commodity = 'INR') => ({ commodity, value });

const rows = [
	{ account: 'Assets', total: '950', holdings: [] },
	{ account: 'Assets:Bank', total: '600', holdings: [rupees('600')] },
	{
		account: 'Assets:Broker',
		total: '400',
		holdings: [rupees('300', 'INFY'), rupees('100', 'TCS'), rupees(null, 'XYZ')],
	},
	{ account: 'Assets:Loan', total: '-50', holdings: [rupees('-50')] },
	{ account: 'Liabilities', total: '-500', holdings: [] },
	{ account: 'Liabilities:Card', total: '-500', holdings: [rupees('-500')] },
];

type Shape = { label: string; amount: number; tiles: Shape[] };

const shape = (t: Shape): unknown => [t.label, t.amount, t.tiles.map(shape)];

const overlaps = (a: Box, b: Box) =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

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

describe('the layout', () => {
	const boxes = boxesOf(tileOf(rows, 'Assets'), { width: 400, height: 200 });
	const [bank, broker, ...holdings] = boxes;

	it('sizes the boxes by what they hold, inside the chart and apart from each other', () => {
		expect(boxes.map((b) => [b.label, b.depth, b.group])).toEqual([
			['Bank', 1, false],
			['Broker', 1, true],
			['INFY', 2, false],
			['TCS', 2, false],
		]);
		expect(
			boxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.width <= 400 && b.y + b.height <= 200),
		).toBe(true);
		expect(bank && broker && overlaps(bank, broker)).toBe(false);
		expect(
			((bank?.width ?? 0) * (bank?.height ?? 0)) / ((broker?.width ?? 0) * (broker?.height ?? 1)),
		).toBeCloseTo(1.5, 0);
	});

	it("puts a group's boxes inside it, below its name", () => {
		expect(
			holdings.every(
				(h) =>
					broker &&
					h.x > broker.x &&
					h.y > broker.y + 24 &&
					h.x + h.width <= broker.x + broker.width &&
					h.y + h.height <= broker.y + broker.height,
			),
		).toBe(true);
	});

	it('leaves out boxes too thin to see, filling the space with the rest', () => {
		const sliver = [
			{ account: 'Assets', total: '1000', holdings: [] },
			{ account: 'Assets:Bank', total: '999', holdings: [rupees('999')] },
			{ account: 'Assets:Cash', total: '1', holdings: [rupees('1')] },
		];
		const laid = boxesOf(tileOf(sliver, 'Assets'), { width: 400, height: 200 });
		expect(laid.map((b) => [b.label, b.width, b.height])).toEqual([['Bank', 400, 200]]);
	});

	it('fills the chart with an account that has nothing under it', () => {
		expect(boxesOf(tileOf(rows, 'Assets:Bank'), { width: 400, height: 200 })).toEqual([
			expect.objectContaining({ label: 'Bank', amount: 600, x: 0, y: 0, width: 400, height: 200 }),
		]);
	});

	it('leaves out what a group has no room for', () => {
		const tiny = boxesOf(tileOf(rows, 'Assets'), { width: 200, height: 60 });
		expect(tiny.map((b) => [b.label, b.group])).toEqual([
			['Bank', false],
			['Broker', false],
		]);
	});
});
