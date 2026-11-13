import { describe, expect, it } from 'vitest';
import { fileHref, hrefWith, lotsHref, postingsHref } from '#lib/web/shared/links.ts';

describe('fileHref', () => {
	it('opens a file, escaping its path', () => {
		expect(fileHref('quiet-heron', 'bank/aug 26.rupea')).toBe(
			'/l/quiet-heron/files?file=bank%2Faug+26.rupea',
		);
	});

	it('opens a file at a line', () => {
		expect(fileHref('quiet-heron', 'a.rupea', 4)).toBe('/l/quiet-heron/files?file=a.rupea&line=4');
	});
});

describe('postingsHref', () => {
	it('opens the postings with a query', () => {
		expect(postingsHref('quiet-heron', { account: 'Expenses:Food', from: '2026-04-01' })).toBe(
			'/l/quiet-heron/postings?account=Expenses%3AFood&from=2026-04-01',
		);
	});

	it('escapes a value with a space', () => {
		expect(postingsHref('quiet-heron', { account: 'Expenses:Eating Out' })).toBe(
			'/l/quiet-heron/postings?account=Expenses%3AEating+Out',
		);
	});
});

describe('lotsHref', () => {
	it('opens the lots of a commodity in an account', () => {
		expect(lotsHref('quiet-heron', { account: 'Assets:Stocks', commodity: 'INFY LTD' })).toBe(
			'/l/quiet-heron/accounts/lots?account=Assets%3AStocks&commodity=INFY+LTD',
		);
	});
});

describe('hrefWith', () => {
	it('changes some values and keeps the rest of the query', () => {
		const params = new URLSearchParams('at=2026&chart=flow');
		expect(hrefWith(params, { chart: 'time', account: 'Assets' })).toBe(
			'?at=2026&chart=time&account=Assets',
		);
	});

	it('drops a key whose value is empty', () => {
		expect(hrefWith(new URLSearchParams('at=2026&account=Assets'), { account: '' })).toBe(
			'?at=2026',
		);
	});

	it('drops a key whose value is undefined', () => {
		expect(hrefWith(new URLSearchParams('at=2026&account=Assets'), { account: undefined })).toBe(
			'?at=2026',
		);
	});
});
