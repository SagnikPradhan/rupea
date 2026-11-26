import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';
import SpendingBars from '#lib/web/components/app-spending-bars/app-spending-bars.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

const SPENDING = {
	buckets: [on('2026-01-01'), on('2026-02-01')],
	totals: [{ account: 'Expenses', parent: null, amount: amount('1000'), unpriced: 0 }],
	deltas: [
		{ account: 'Expenses', bucket: on('2026-01-01'), amount: amount('600') },
		{ account: 'Expenses', bucket: on('2026-02-01'), amount: amount('400') },
	],
};

const PREVIOUS = { ...SPENDING, buckets: [on('2025-01-01')] };

const PROPS = {
	spending: SPENDING,
	previous: undefined,
	account: 'Expenses',
	parts: [],
	colours: {},
	bucket: 'month' as const,
	compare: 'with' as const,
	scale: 'linear' as const,
	handle: 'h',
	first: on('2026-01-01'),
	last: on('2026-02-28'),
};

describe('the spending bars', () => {
	it('draws a calendar for a day bucket', () => {
		render(SpendingBars, { ...PROPS, bucket: 'day' });

		expect(screen.getByRole('table', { name: /^Spending from/ })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Linear' })).toBeNull();
	});

	it('draws bars for a month bucket, with the comparison picker only after a previous range', () => {
		const { unmount } = render(SpendingBars, PROPS);

		expect(screen.getByRole('link', { name: 'Linear' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull();
		unmount();

		render(SpendingBars, { ...PROPS, previous: PREVIOUS });
		expect(screen.getByRole('link', { name: 'Compare' })).toBeTruthy();
	});
});
