import { describe, expect, it } from 'vitest';
import {
	type Aggregate,
	type Bucket,
	type Measure,
	bucketFor,
	bucketKeyOf,
	endsIn,
	isReadable,
} from '../src/balances.ts';

const day = (d: string) => Temporal.PlainDate.from(d);

describe('a bucket key', () => {
	it('names a bucket as the API does', () => {
		expect(Object.values(bucketKeyOf).map((key) => key(day('2026-10-05')))).toEqual([
			'2026-10-05',
			'5',
			'2026-10',
			'2026',
		]);
	});

	it('groups what a chart draws as a day by the date', () => {
		expect(bucketFor).toEqual({ day: 'date', month: 'month', year: 'year' });
	});
});

describe('where buckets end', () => {
	it('closes each month the day before the next, and the last at the span', () => {
		const span = { from: day('2026-01-20'), to: day('2026-03-10') };

		expect(endsIn(span, 'month').map(String)).toEqual(['2026-01-31', '2026-02-28', '2026-03-10']);
		expect(endsIn(span, 'year').map(String)).toEqual(['2026-03-10']);
		expect(endsIn({ from: day('2026-03-01'), to: day('2026-03-02') }, 'date').map(String)).toEqual([
			'2026-03-01',
			'2026-03-02',
		]);
	});
});

describe('whether a read can be answered', () => {
	const asked: { aggregate: Aggregate; bucket: Bucket; measures: Measure[] } = {
		aggregate: 'sum',
		bucket: 'month',
		measures: ['value'],
	};

	it('refuses a balance by day of the month, or with inflow or outflow', () => {
		expect(isReadable({ ...asked, accumulate: 'historical' })).toBe(true);
		expect(isReadable({ ...asked, accumulate: 'historical', bucket: 'day' })).toBe(false);
		expect(isReadable({ ...asked, accumulate: 'historical', measures: ['inflow'] })).toBe(false);
		expect(
			isReadable({ ...asked, accumulate: 'change', bucket: 'day', measures: ['inflow'] }),
		).toBe(true);
	});

	it('refuses an average unless the bucket is a day of the month', () => {
		expect(isReadable({ ...asked, accumulate: 'change', aggregate: 'average' })).toBe(false);
		expect(
			isReadable({ ...asked, accumulate: 'change', aggregate: 'average', bucket: 'day' }),
		).toBe(true);
	});
});
