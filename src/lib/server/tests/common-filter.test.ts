import { describe, expect, it } from 'vitest';
import { filterOf } from '#lib/shared/filter.ts';

const read = (query: string) => filterOf(new URLSearchParams(query));

describe('a filter', () => {
	it('reads the period, the account and the description, trimmed', () => {
		expect(read('at=2026-03&account=Expenses:Food&description=%20tea%20')).toEqual({
			period: { kind: 'month', at: '2026-03' },
			account: 'Expenses:Food',
			description: 'tea',
		});
	});

	it('lists all of history when the period is missing or not one', () => {
		expect(read('from=2026-02-30&to=2026-03-01').period).toEqual({ kind: 'all' });
	});

	it('leaves every side open when the URL names none', () => {
		expect(read('')).toEqual({ period: { kind: 'all' }, account: '', description: '' });
	});
});
