import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readContents, unlock } from '#services/extraction/adapters/grid.ts';
import officeCrypto from 'officecrypto-tool';
import * as XLSX from 'xlsx';
import { err, ok } from '#lib/server/shared/result/result.ts';

const bytes = (t: string) => new TextEncoder().encode(t);

describe('reading the contents of a file', () => {
	it('reads a CSV row per line, quotes, BOM, ragged rows and all', async () => {
		const csv = '\uFEFFDate,Narration,Amount\n29/08/26,"GROCER, BLR","1,250.50"\n\nTotal\n';
		expect(await readContents({ name: 'a.CSV', content: bytes(csv) })).toEqual(
			ok({
				grid: [
					['Date', 'Narration', 'Amount'],
					['29/08/26', 'GROCER, BLR', '1,250.50'],
					[''],
					['Total'],
				],
				text: [],
			}),
		);
	});

	it('reads a sheet as text: dates as ISO days, numbers as their values, empty cells blank', async () => {
		const content = await readFile(join(import.meta.dirname, 'fixtures/statement.xlsx'));
		expect(await readContents({ name: 'a.xlsx', content })).toEqual(
			ok({
				grid: [
					['Date', 'Narration', 'Ref', 'Amount'],
					['2026-08-29', 'GROCER', '', '1250.5'],
				],
				text: [],
			}),
		);
	});

	it('reads a legacy .xls, and one that banks send as HTML', async () => {
		const book = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(
			book,
			XLSX.utils.aoa_to_sheet([
				['Date', 'Amount'],
				['27/08/26', 8997.35],
			]),
		);
		const xls = XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Uint8Array;
		const html = bytes(
			'<table><tr><td>Date</td><td>Amount</td></tr><tr><td>27/08/26</td><td>8997.35</td></tr></table>',
		);

		const expected = ok({
			grid: [
				['Date', 'Amount'],
				['27/08/26', '8997.35'],
			],
			text: [],
		});
		expect(await readContents({ name: 'a.xls', content: xls })).toEqual(expected);
		expect(await readContents({ name: 'a.xls', content: html })).toEqual(expected);
	});

	it('tells a locked .xlsx apart, and opens it with its password', async () => {
		const content = await readFile(join(import.meta.dirname, 'fixtures/statement.xlsx'));
		const locked = new Uint8Array(await officeCrypto.encrypt(content, { password: 'secret' }));

		expect(await readContents({ name: 'a.xlsx', content: locked })).toEqual(
			err({ type: 'ExtractionLocked', path: 'a.xlsx' }),
		);
		expect(await unlock({ name: 'a.xlsx', content: locked, password: 'wrong' })).toEqual(
			err({ type: 'ExtractionLocked', path: 'a.xlsx' }),
		);
		const unlocked = await unlock({ name: 'a.xlsx', content: locked, password: 'secret' });
		expect(await readContents({ name: 'a.xlsx', content: unlocked._unsafeUnwrap() })).toMatchObject(
			ok({ grid: [['Date', 'Narration', 'Ref', 'Amount'], expect.anything()] }),
		);
	});

	it('reports an unreadable file as one that cannot be read', async () => {
		expect(await readContents({ name: 'a.csv', content: bytes('a,"b\n') })).toMatchObject({
			error: { type: 'CannotReadFile', path: 'a.csv' },
		});
		expect(await readContents({ name: 'a.xlsx', content: bytes('not a zip') })).toMatchObject({
			error: { type: 'CannotReadFile', path: 'a.xlsx' },
		});
	});

	it.each(['a.txt', 'a'])('refuses %j', async (name) => {
		expect(await readContents({ name, content: bytes('') })).toEqual(
			err({ type: 'ExtractionUnsupportedFile', path: name }),
		);
	});
});
