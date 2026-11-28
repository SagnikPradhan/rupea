import { describe, expect, it } from 'vitest';
import {
	countLabel,
	foldersOf,
	keysUnder,
	movedTo,
	treeRows,
} from '#lib/web/components/app-file-index/file-tree.ts';

const files = [
	'b.rupea',
	'_/imports/20261019/hdfc.rupea',
	'a.rupea',
	'_/imports/20261019/idfc.rupea',
].map((key) => ({ key }));

const shape = (toggled: string[]) =>
	treeRows(files, toggled).map((r) => `${'  '.repeat(r.depth)}${r.name}${r.file ? '' : '/'}`);

describe('treeRows', () => {
	it('puts folders before files, each before what it holds', () => {
		expect(shape(['_/imports/', '_/imports/20261019/'])).toEqual([
			'_/',
			'  imports/',
			'    20261019/',
			'      hdfc.rupea',
			'      idfc.rupea',
			'a.rupea',
			'b.rupea',
		]);
	});

	it('starts with top-level folders open and deeper ones closed', () => {
		expect(shape([])).toEqual(['_/', '  imports/', 'a.rupea', 'b.rupea']);
	});

	it('hides what a closed folder holds, but not the folder', () => {
		expect(shape(['_/'])).toEqual(['_/', 'a.rupea', 'b.rupea']);
	});

	it('keeps a folder hidden while any folder above it is closed', () => {
		expect(shape(['_/', '_/imports/'])).toEqual(['_/', 'a.rupea', 'b.rupea']);
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

describe('countLabel', () => {
	it('counts files, singular for one', () => {
		expect(countLabel(1)).toBe('1 file');
		expect(countLabel(62)).toBe('62 files');
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

describe('foldersOf', () => {
	it('lists each folder above a key, outermost first', () => {
		expect(foldersOf('a/b/c.rupea')).toEqual(['a/', 'a/b/']);
		expect(foldersOf('c.rupea')).toEqual([]);
	});
});
