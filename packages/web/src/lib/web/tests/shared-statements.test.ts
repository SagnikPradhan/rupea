import {
	headersForOriginal,
	isShowable,
	STEP_AT,
	STEPS,
	suggestedFile,
} from '#lib/web/shared/statements.ts';
import { describe, expect, it } from 'vitest';

const found = [
	{ date: '2026-09-30', postings: [{ account: 'Assets:Bank:HDFC' }] },
	{ date: '2026-10-02', postings: [{ account: 'Assets:Bank:HDFC' }] },
];

describe('a suggested file', () => {
	it('is named for the account and the month the statement ends in', () =>
		expect(suggestedFile('20261027/hdfc.xls', found)).toBe('hdfc/2026-10.rupea'));

	it('keeps a ledger file’s own name, as it holds many accounts', () =>
		expect(suggestedFile('20261027/books.ledger', found)).toBe('books.rupea'));

	it('falls back on the statement’s name when nothing was found', () =>
		expect(suggestedFile('20261027/hdfc.xls', [])).toBe('hdfc.rupea'));
});

describe('the steps of an import', () => {
	it('puts a statement waiting for its first reading at the Read step', () =>
		expect(STEPS[STEP_AT.reading]).toBe('Read'));

	it('puts a drafted statement at the Review step', () =>
		expect(STEPS[STEP_AT.ready]).toBe('Review'));

	it('has every step done once the statement is added', () =>
		expect(STEP_AT.added).toBe(STEPS.length));
});

describe('serving an original statement', () => {
	it.for([
		['a.pdf', 'application/pdf', 'inline'],
		['a.PDF', 'application/pdf', 'inline'],
		['a.csv', 'text/csv', 'attachment'],
		['a.xls', 'application/vnd.ms-excel', 'attachment'],
		['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'attachment'],
		['a.html', 'application/octet-stream', 'attachment'],
		['a', 'application/octet-stream', 'attachment'],
	])('serves %s as %s, %s', ([name, type, disposition]) => {
		const headers = headersForOriginal(name!);

		expect(headers['Content-Type']).toBe(type);
		expect(headers['Content-Disposition']).toBe(disposition);
		expect(headers['X-Content-Type-Options']).toBe('nosniff');
	});

	it('shows only a PDF in a frame', () => {
		expect(isShowable('20261121/card.pdf')).toBe(true);
		expect(isShowable('20261121/card.xlsx')).toBe(false);
	});
});
