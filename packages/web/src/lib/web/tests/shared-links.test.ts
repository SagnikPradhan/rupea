import { beforeEach, describe, expect, it, vi } from 'vitest';
import { visit } from '#tests/shared/app-state.ts';
import { fileHref, hrefOnly, hrefWith, lotsHref, postingsHref } from '#lib/web/shared/links.ts';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));

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
			'/l/quiet-heron/net-worth/lots?account=Assets%3AStocks&commodity=INFY+LTD',
		);
	});
});

describe('hrefOnly', () => {
	beforeEach(() => visit('/l/quiet-heron/postings?at=2026&account=Assets'));

	it('keeps the page and replaces its whole query', () => {
		expect(hrefOnly({ file: 'a b.rupea' })).toBe('/l/quiet-heron/postings?file=a+b.rupea');
	});

	it('is the bare path when given no query', () => {
		expect(hrefOnly({})).toBe('/l/quiet-heron/postings');
	});

	it('keeps the pathname on a page with no route', () => {
		visit('/missing?at=2026');
		expect(hrefOnly({ at: '2025' })).toBe('/missing?at=2025');
	});
});

describe('hrefWith', () => {
	beforeEach(() => visit('/l/quiet-heron/postings'));

	it('changes some values and keeps the rest of the query', () => {
		const params = new URLSearchParams('at=2026&chart=flow');
		expect(hrefWith(params, { chart: 'time', account: 'Assets' })).toBe(
			'/l/quiet-heron/postings?at=2026&chart=time&account=Assets',
		);
	});

	it('drops a key whose value is empty', () => {
		expect(hrefWith(new URLSearchParams('at=2026&account=Assets'), { account: '' })).toBe(
			'/l/quiet-heron/postings?at=2026',
		);
	});

	it('drops a key whose value is undefined', () => {
		expect(hrefWith(new URLSearchParams('at=2026&account=Assets'), { account: undefined })).toBe(
			'/l/quiet-heron/postings?at=2026',
		);
	});
});
