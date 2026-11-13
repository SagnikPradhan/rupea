import { describe, expect, it } from 'vitest';
import { PERIOD_PARAMS, filterOf, paramsOf, periodIn, periodOf } from '#lib/web/shared/filter.ts';
import type { Period } from '@rupea/shared/dates.ts';

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

describe('a period', () => {
	const THIS_YEAR = { kind: 'year', at: '2026' } as const;
	const read = (query: string) => periodOf(new URLSearchParams(query), THIS_YEAR);

	it('is a month or year by name, all of history, or the days between two', () => {
		expect(read('at=2026-03')).toEqual({ kind: 'month', at: '2026-03' });
		expect(read('at=2024')).toEqual({ kind: 'year', at: '2024' });
		expect(read('range=all')).toEqual({ kind: 'all' });
		expect(read('from=2026-01-05&to=2026-02-10')).toEqual({
			kind: 'custom',
			from: '2026-01-05',
			to: '2026-02-10',
		});
	});

	it('is the fallback when the URL picks none, or picks one badly', () => {
		expect(read('')).toEqual({ kind: 'year', at: '2026' });
		expect(read('at=2026-13')).toEqual({ kind: 'year', at: '2026' });
		expect(read('range=1m')).toEqual({ kind: 'year', at: '2026' });
		expect(read('from=2026-02-30&to=2026-03-01')).toEqual({ kind: 'year', at: '2026' });
		expect(read('from=2026-03-01&to=2026-02-01')).toEqual({ kind: 'year', at: '2026' });
	});

	it('is read back from the parameters it is written as', () => {
		const periods: Period[] = [
			{ kind: 'month', at: '2026-03' },
			THIS_YEAR,
			{ kind: 'all' },
			{ kind: 'custom', from: '2026-01-05', to: '2026-02-10' },
		];
		const back = periods.map((p) => read(new URLSearchParams(paramsOf(p)).toString()));
		expect(back).toEqual(periods);
	});
});

describe('the period of parsed query fields', () => {
	it('reads the same period as the URL would', () => {
		expect(periodIn({ range: 'all' }, { kind: 'year', at: '2026' })).toEqual({ kind: 'all' });
		expect(periodIn({ from: '2026-01-01', to: '2026-02-01' }, { kind: 'all' })).toEqual({
			kind: 'custom',
			from: '2026-01-01',
			to: '2026-02-01',
		});
	});

	it('falls back when no field picks one', () => {
		expect(periodIn({ at: undefined }, { kind: 'all' })).toEqual({ kind: 'all' });
	});

	it('names the four parameters', () => {
		expect(PERIOD_PARAMS).toEqual(['at', 'range', 'from', 'to']);
	});
});
