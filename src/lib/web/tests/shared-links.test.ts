import { describe, expect, it } from 'vitest';
import { fileHref, hrefWith } from '#lib/web/shared/links.ts';

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
});
