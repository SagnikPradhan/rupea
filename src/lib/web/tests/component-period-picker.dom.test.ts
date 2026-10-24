import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import PeriodPicker from '#lib/web/components/period-picker/period-picker.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://rupea.test/l/h/expenses?scale=log&at=2026-09') },
}));

const TODAY = '2026-10-24';
const SHOWN = { from: '2026-09-01', to: '2026-09-30' };

describe('the period picker', () => {
	it('swaps only the period, keeping the rest of the query', () => {
		render(PeriodPicker, {
			current: { kind: 'month', at: '2026-09' },
			shown: SHOWN,
			today: TODAY,
			first: '2024-05-10',
		});
		expect(screen.getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: 'Year' }).getAttribute('href')).toBe(
			'?scale=log&at=2026',
		);
		expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe(
			'?scale=log&range=all',
		);
		expect(screen.getByRole('link', { name: 'Custom' }).getAttribute('href')).toBe(
			'?scale=log&from=2026-09-01&to=2026-09-30',
		);
	});

	it('shows the months of the year picked, none after today', () => {
		render(PeriodPicker, {
			current: { kind: 'month', at: '2026-09' },
			shown: SHOWN,
			today: TODAY,
			first: '2024-05-10',
		});
		expect(screen.getByRole('link', { name: /^Sep/ }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: '2026' }).getAttribute('aria-current')).toBe('page');
		expect(screen.queryByRole('link', { name: 'Nov' })).toBeNull();
	});

	it('moves to the same month in another year, or the nearest the ledger has', () => {
		render(PeriodPicker, {
			current: { kind: 'month', at: '2026-03' },
			shown: SHOWN,
			today: TODAY,
			first: '2024-05-10',
		});
		expect(screen.getByRole('link', { name: '2025' }).getAttribute('href')).toBe(
			'?scale=log&at=2025-03',
		);
		expect(screen.getByRole('link', { name: '2024' }).getAttribute('href')).toBe(
			'?scale=log&at=2024-05',
		);
	});

	it('shows none of the months before the first', () => {
		render(PeriodPicker, {
			current: { kind: 'month', at: '2024-06' },
			shown: SHOWN,
			today: TODAY,
			first: '2024-05-10',
		});
		expect(screen.queryByRole('link', { name: 'Apr' })).toBeNull();
		expect(screen.getByRole('link', { name: 'May' }).getAttribute('href')).toBe(
			'?scale=log&at=2024-05',
		);
	});

	it('offers every year from the first to this one', () => {
		render(PeriodPicker, {
			current: { kind: 'year', at: '2025' },
			shown: SHOWN,
			today: TODAY,
			first: '2024-05-10',
		});
		const years = screen.getByRole('navigation', { name: 'Year' });
		expect([...years.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
			'2024',
			'2025',
			'2026',
		]);
		expect(screen.getByRole('link', { name: '2025' }).getAttribute('aria-current')).toBe('page');
	});

	it('offers only this year while the ledger is empty', () => {
		render(PeriodPicker, {
			current: { kind: 'year', at: '2026' },
			shown: SHOWN,
			today: TODAY,
			first: null,
		});
		expect(screen.getAllByRole('link', { name: /^\d{4}$/ }).map((a) => a.textContent)).toEqual([
			'2026',
		]);
	});

	it('picks days between the first and today, starting from those picked', () => {
		render(PeriodPicker, {
			current: { kind: 'custom', from: '2026-01-05', to: '2026-02-10' },
			shown: SHOWN,
			today: TODAY,
			first: '2024-05-10',
		});
		const from = screen.getByLabelText('From');
		expect((from as HTMLInputElement).value).toBe('2026-01-05');
		expect(from.getAttribute('min')).toBe('2024-05-10');
		expect(screen.getByLabelText('To').getAttribute('max')).toBe(TODAY);
		expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
	});
});
