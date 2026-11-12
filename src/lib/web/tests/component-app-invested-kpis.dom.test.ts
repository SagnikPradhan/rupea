import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import InvestedKpis from '#lib/web/components/app-invested-kpis/app-invested-kpis.svelte';

const group = (account: string, gain: number, xirr: number | null) => ({
	account,
	value: 1000 + gain,
	cost: 1000,
	gain,
	netIn: 900,
	xirr,
});

const PROPS = {
	invested: [group('Assets:Stocks', 200, 0.1), group('Assets:Gold', 100, 0.2)],
};

describe('the invested KPIs', () => {
	it('counts one account in the singular and several in the plural', () => {
		const { unmount } = render(InvestedKpis, { invested: [group('Assets:Stocks', 200, 0.1)] });

		expect(screen.getAllByText(/across 1 account$/)).toHaveLength(2);
		unmount();

		render(InvestedKpis, PROPS);
		expect(screen.getAllByText(/across 2 accounts$/)).toHaveLength(2);
	});

	it('shows 0% a year when no account has an xirr', () => {
		render(InvestedKpis, { invested: [group('Assets:Stocks', 200, null)] });

		expect(screen.getByText('0%', { selector: '.figure' })).toBeTruthy();
	});

	it('tones a negative gain negative and a positive one positive', () => {
		const { unmount } = render(InvestedKpis, { invested: [group('Assets:Stocks', -200, 0.1)] });

		expect(screen.getByText(/on cost$/, { selector: '.negative' })).toBeTruthy();
		unmount();

		render(InvestedKpis, PROPS);
		expect(screen.getByText(/on cost$/, { selector: '.positive' })).toBeTruthy();
	});
});
