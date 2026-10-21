import { describe, expect, it } from 'vitest';
import { keysUnder, movedTo, treeRows } from '#lib/web/components/file-index/file-tree.ts';

const files = [
	'b.rupee',
	'_/imports/20261019/hdfc.rupee',
	'a.rupee',
	'_/imports/20261019/idfc.rupee',
].map((key) => ({ key }));

const shape = (collapsed: string[]) =>
	treeRows(files, collapsed).map((r) => `${'  '.repeat(r.depth)}${r.name}${r.file ? '' : '/'}`);

describe('treeRows', () => {
	it('puts folders before files, each before what it holds', () => {
		expect(shape([])).toEqual([
			'_/',
			'  imports/',
			'    20261019/',
			'      hdfc.rupee',
			'      idfc.rupee',
			'a.rupee',
			'b.rupee',
		]);
	});

	it('hides what a collapsed folder holds, but not the folder', () => {
		expect(shape(['_/imports/'])).toEqual(['_/', '  imports/', 'a.rupee', 'b.rupee']);
	});
});

describe('keysUnder', () => {
	it('finds every file in a folder, however deep', () => {
		expect(keysUnder(files, '_/')).toEqual([
			'_/imports/20261019/hdfc.rupee',
			'_/imports/20261019/idfc.rupee',
		]);
	});
});

describe('movedTo', () => {
	it('keeps the name in its new folder', () => {
		expect(movedTo('_/imports/20261019/hdfc.rupee', ' bank/2026/ ')).toBe('bank/2026/hdfc.rupee');
	});

	it('moves to the top for an empty folder', () => {
		expect(movedTo('_/imports/20261019/hdfc.rupee', '')).toBe('hdfc.rupee');
	});
});
