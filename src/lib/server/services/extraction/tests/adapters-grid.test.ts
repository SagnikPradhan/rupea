import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGrid } from '#services/extraction/adapters/grid.ts';
import { err, ok } from '#lib/server/shared/result.ts';

const bytes = (t: string) => new TextEncoder().encode(t);

describe('reading a grid from a file', () => {
	it('reads a CSV row per line, quotes, BOM, ragged rows and all', async () => {
		const csv = '\uFEFFDate,Narration,Amount\n29/08/26,"GROCER, BLR","1,250.50"\n\nTotal\n';
		expect(await readGrid({ name: 'a.CSV', content: bytes(csv) })).toEqual(
			ok([
				['Date', 'Narration', 'Amount'],
				['29/08/26', 'GROCER, BLR', '1,250.50'],
				[''],
				['Total'],
			]),
		);
	});

	it('reads a sheet as text: dates as ISO days, numbers as their values, empty cells blank', async () => {
		const content = await readFile(join(import.meta.dirname, 'fixtures/statement.xlsx'));
		expect(await readGrid({ name: 'a.xlsx', content })).toEqual(
			ok([
				['Date', 'Narration', 'Ref', 'Amount'],
				['2026-08-29', 'GROCER', '', '1250.5'],
			]),
		);
	});

	it('reports an unreadable file as one that cannot be read', async () => {
		expect(await readGrid({ name: 'a.csv', content: bytes('a,"b\n') })).toMatchObject(
			err({ type: 'CannotReadFile', path: 'a.csv' }),
		);
		expect(await readGrid({ name: 'a.xlsx', content: bytes('not a zip') })).toMatchObject(
			err({ type: 'CannotReadFile', path: 'a.xlsx' }),
		);
	});

	it.each(['a.xls', 'a.txt', 'a'])('refuses %j', async (name) => {
		expect(await readGrid({ name, content: bytes('') })).toEqual(
			err({ type: 'ExtractionUnsupportedFile', path: name, cause: [] }),
		);
	});
});
