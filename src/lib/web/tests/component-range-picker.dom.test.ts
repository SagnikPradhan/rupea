import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import RangePicker from '#lib/web/components/range-picker/range-picker.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://rupea.test/l/h/accounts?range=1m&account=Assets') },
}));

describe('the range picker', () => {
	it('marks the current range', () => {
		render(RangePicker, { current: 'ytd' });
		expect(screen.getByRole('link', { name: 'YTD' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: '1M' }).getAttribute('aria-current')).toBeNull();
	});

	it('swaps only the range, keeping the rest of the query', () => {
		render(RangePicker, { current: '1m' });
		expect(screen.getByRole('link', { name: '1Y' }).getAttribute('href')).toBe(
			'?range=1y&account=Assets',
		);
	});
});
