import { describe, expect, it } from 'vitest';
import { fileHref, ledgerCrumb } from '#lib/web/links.ts';

describe('fileHref', () => {
	it('opens a file, escaping its path', () => {
		expect(fileHref('quiet-heron', 'bank/aug 26.rupee')).toBe(
			'/l/quiet-heron/files?file=bank%2Faug+26.rupee',
		);
	});

	it('opens a file at a line', () => {
		expect(fileHref('quiet-heron', 'a.rupee', 4)).toBe('/l/quiet-heron/files?file=a.rupee&line=4');
	});
});

describe('ledgerCrumb', () => {
	it('leads to the ledger’s transactions', () => {
		expect(ledgerCrumb({ handle: 'quiet-heron', name: 'Personal' })).toEqual({
			href: '/l/quiet-heron/transactions',
			label: 'Personal',
		});
	});
});
