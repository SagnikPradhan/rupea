import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import NetWorth from '#lib/web/components/app-net-worth/app-net-worth.svelte';

const day = (on: string, worth: string, liabilities = '0', unpriced = 0) => ({
	day: on,
	assets: String(Number(worth) - Number(liabilities)),
	liabilities,
	worth,
	parts: [],
	unpriced,
});

const drawn = (days: [string, string, string?, number?][]) =>
	render(NetWorth, {
		worth: days.map(([on, worth, liabilities, unpriced]) => day(on, worth, liabilities, unpriced)),
	});

describe('the net worth chart', () => {
	it('draws nothing before the ledger has a day', () => {
		drawn([]);
		expect(screen.queryByRole('figure')).toBeNull();
	});

	it('marks a fall from nothing as negative with no percent, keying what is owed and what is unpriced', () => {
		drawn([
			['2026-01-01', '0'],
			['2026-02-01', '-500', '-800', 2],
		]);

		const change = screen.getByRole('figure').querySelector('span.negative');
		expect(change?.textContent?.trim()).toBe('-500');
		expect(screen.getByText('· excludes 2 unpriced')).toBeTruthy();
		expect(screen.getByText(/^Owed/)).toBeTruthy();
	});

	it('marks a rise as positive with its percent, keying nothing owed', () => {
		drawn([
			['2026-01-01', '1000'],
			['2026-02-01', '1500'],
		]);

		const change = screen.getByText(/^\+500/);
		expect(change.classList.contains('positive')).toBe(true);
		expect(change.textContent).toContain('(+50%)');
		expect(screen.queryByText(/^Owed/)).toBeNull();
	});
});
