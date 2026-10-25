import { describe, expect, it } from 'vitest';
import { keysUnder, movedTo, treeRows } from '#lib/web/components/file-index/file-tree.ts';

const files = [
	'b.rupea',
	'_/imports/20261019/hdfc.rupea',
	'a.rupea',
	'_/imports/20261019/idfc.rupea',
].map((key) => ({ key }));

const shape = (collapsed: string[]) =>
	treeRows(files, collapsed).map((r) => `${'  '.repeat(r.depth)}${r.name}${r.file ? '' : '/'}`);

describe('treeRows', () => {
	it('puts folders before files, each before what it holds', () => {
		expect(shape([])).toEqual([
			'_/',
			'  imports/',
			'    20261019/',
			'      hdfc.rupea',
			'      idfc.rupea',
			'a.rupea',
			'b.rupea',
		]);
	});

	it('hides what a collapsed folder holds, but not the folder', () => {
		expect(shape(['_/imports/'])).toEqual(['_/', '  imports/', 'a.rupea', 'b.rupea']);
	});
});

describe('keysUnder', () => {
	it('finds every file in a folder, however deep', () => {
		expect(keysUnder(files, '_/')).toEqual([
			'_/imports/20261019/hdfc.rupea',
			'_/imports/20261019/idfc.rupea',
		]);
	});
});

describe('movedTo', () => {
	it('keeps the name in its new folder', () => {
		expect(movedTo('_/imports/20261019/hdfc.rupea', ' bank/2026/ ')).toBe('bank/2026/hdfc.rupea');
	});

	it('drops empty and padded parts of the folder', () => {
		expect(movedTo('a.rupea', '//bank// 2026 /')).toBe('bank/2026/a.rupea');
	});

	it('moves to the top for an empty folder', () => {
		expect(movedTo('_/imports/20261019/hdfc.rupea', '')).toBe('hdfc.rupea');
	});
});
