import { describe, expect, it } from 'vitest';
import { filterOf } from '#lib/shared/filter.ts';

describe('a filter', () => {
	it('reads days beside the range, and drops days that are not ISO dates', () => {
		const filter = filterOf([
			['range', 'ytd'],
			['from', '2026-03-01'],
			['to', '31/03/2026'],
		]);
		expect(filter).toMatchObject({ range: 'ytd', from: '2026-03-01', to: '' });
	});

	it('drops a day that does not exist', () => {
		expect(filterOf([['from', '2026-02-30']]).from).toBe('');
	});

	it('leaves every side open when the URL names none', () => {
		expect(filterOf([])).toEqual({ range: 'all', from: '', to: '', account: '', description: '' });
	});
});
