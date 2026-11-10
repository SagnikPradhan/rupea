import { describe, expect, it } from 'vitest';
import type { Detection } from '#lib/server/shared/onnx/runtime.ts';
import { toGrid, widen, type Word } from '#services/extraction/domain/table.ts';

const column = (x1: number, x2: number, score = 0.9): Detection => ({
	label: 'table column',
	score,
	x1,
	y1: 0,
	x2,
	y2: 1000,
});

// Date, Narration, Withdrawal, Deposit.
const columns = [column(0, 100), column(100, 300), column(300, 400), column(400, 500)];

const word = (text: string, x: number, y: number): Word => ({
	text,
	x1: x,
	y1: y - 10,
	x2: x + text.length * 6,
	y2: y,
});

describe('laying words out in a grid', () => {
	it('puts each text line in a row, each word in its column', () => {
		const words = [
			word('Date', 10, 20),
			word('Narration', 110, 20),
			word('Withdrawal', 310, 20),
			word('Deposit', 410, 20),
			word('01/08/26', 10, 40),
			word('UPI-SHOP', 110, 40),
			word('120.50', 310, 40),
		];
		expect(toGrid(columns, words)).toEqual([
			['Date', 'Narration', 'Withdrawal', 'Deposit'],
			['01/08/26', 'UPI-SHOP', '120.50', ''],
		]);
	});

	it('reads a cell line by line, left to right, whatever order the words come in', () => {
		const words = [
			word('SHOP', 160, 40),
			word('01/08/26', 10, 40),
			word('UPI', 110, 40),
			word('120.50', 310, 40),
		];
		expect(toGrid(columns, words)).toEqual([['01/08/26', 'UPI SHOP', '120.50', '']]);
	});

	it('merges a narration wrapped onto the next line into its row', () => {
		const words = [
			word('01/08/26', 10, 40),
			word('UPI-MERCHANT', 110, 40),
			word('120.50', 310, 40),
			word('FOR', 110, 52),
			word('ORDER', 140, 52),
			word('02/08/26', 10, 70),
			word('UPI-SHOP', 110, 70),
			word('80.00', 310, 70),
		];
		expect(toGrid(columns, words)).toEqual([
			['01/08/26', 'UPI-MERCHANT FOR ORDER', '120.50', ''],
			['02/08/26', 'UPI-SHOP', '80.00', ''],
		]);
	});

	it('merges a narration wrapped around a vertically centred row into it', () => {
		const words = [
			word('UPI-MERCHANT', 110, 34),
			word('01/08/26', 10, 40),
			word('120.50', 310, 40),
			word('ORDER', 110, 45),
		];
		expect(toGrid(columns, words)).toEqual([['01/08/26', 'UPI-MERCHANT ORDER', '120.50', '']]);
	});

	it('merges both halves of a narration centred on an otherwise empty line', () => {
		const words = [
			word('UPI-MERCHANT', 110, 35),
			word('01/08/26', 10, 40),
			word('120.50', 310, 40),
			word('ORDER', 110, 46),
		];
		expect(toGrid(columns, words)).toEqual([['01/08/26', 'UPI-MERCHANT ORDER', '120.50', '']]);
	});

	it('keeps a sparse row apart from a row beyond its line spacing', () => {
		const words = [
			word('Date', 10, 20),
			word('Narration', 110, 20),
			word('Withdrawal', 310, 20),
			word('Deposit', 410, 20),
			word('Purchases', 110, 40),
			word('0.00', 310, 40),
		];
		expect(toGrid(columns, words)).toEqual([
			['Date', 'Narration', 'Withdrawal', 'Deposit'],
			['', 'Purchases', '0.00', ''],
		]);
	});

	it('joins two columns that text runs across more often than not', () => {
		const split = [column(0, 100), column(100, 150), column(150, 200)];
		const words = [
			word('Total Amount', 100, 20),
			word('01/08/26', 10, 40),
			word('3,259.13 DR', 100, 40),
			word('02/08/26', 10, 60),
			word('0.00', 110, 60),
		];
		expect(toGrid(split, words)).toEqual([
			['', 'Total Amount'],
			['01/08/26', '3,259.13 DR'],
			['02/08/26', '0.00'],
		]);
	});

	it('keeps a row filling a column the row above left empty', () => {
		const words = [
			word('01/08/26', 10, 40),
			word('UPI', 110, 40),
			word('120.50', 310, 40),
			word('50,000.00', 410, 60),
		];
		expect(toGrid(columns, words)).toEqual([
			['01/08/26', 'UPI', '120.50', ''],
			['', '', '', '50,000.00'],
		]);
	});

	it('puts a word between columns in the nearest one', () => {
		expect(toGrid([column(0, 100), column(200, 300)], [word('x', 170, 20)])).toEqual([['', 'x']]);
	});

	it('keeps two columns apart when text only reaches into the gap between them', () => {
		const gapped = [column(0, 100), column(150, 200)];
		const words = [
			word('EMI', 10, 20),
			word('FX', 120, 20),
			word('Convert', 10, 40),
			word('USD', 120, 40),
		];
		expect(toGrid(gapped, words)).toEqual([
			['EMI', 'FX'],
			['Convert', 'USD'],
		]);
	});

	it('keeps the likelier of two columns found twice', () => {
		const twice = [column(0, 100), column(100, 200, 0.6), column(105, 200)];
		expect(toGrid(twice, [word('a', 10, 20), word('b', 110, 20)])).toEqual([['a', 'b']]);
	});

	it('reads nothing from a table with no columns', () => {
		expect(toGrid([], [word('a', 10, 20)])).toEqual([]);
	});
});

describe('widening a detected table', () => {
	const box = { x1: 76, y1: 100, x2: 500, y2: 200 };

	it('takes in the words its edges cut through', () => {
		const words = [word('24/05/2026', 46, 150), word('DR', 495, 150)];
		expect(widen(box, words)).toEqual({ ...box, x1: 46, x2: 507 });
	});

	it('leaves alone words outside it, above or below it, and words it holds', () => {
		const words = [word('Page', 10, 150), word('24/05/2026', 46, 90), word('Apollo', 100, 150)];
		expect(widen(box, words)).toEqual(box);
	});
});
