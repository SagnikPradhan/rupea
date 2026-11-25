import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import InvestedRisk from '#lib/web/components/app-invested-risk/app-invested-risk.svelte';

const row = (account: string, xirr: number | null) => ({
	account,
	name: account.split(':').at(-1) ?? account,
	value: 1000,
	cost: 900,
	gain: 100,
	gainRate: 100 / 900,
	netIn: 900,
	xirr,
});

const arc = {
	key: 'Assets:Stocks',
	label: 'Stocks',
	level: 1,
	part: 0,
	from: 0,
	to: 1,
	value: 1000,
	share: 1,
	own: true,
};

describe('the invested risk', () => {
	it('plots an account that has both a return and a swing', () => {
		render(InvestedRisk, {
			invested: [row('Assets:Stocks', 0.1)],
			swings: [{ account: 'Assets:Stocks', swing: 0.2 }],
			arcs: [arc],
			account: null,
		});

		expect(
			screen.getByRole('img', { name: 'Return a year against how much each account swings' }),
		).toBeTruthy();
		expect(screen.queryByText('Needs price history.')).toBeNull();
	});

	it('lists each plotted account as a chip with its return, the chosen one marked', () => {
		render(InvestedRisk, {
			invested: [row('Assets:Stocks', 0.1)],
			swings: [{ account: 'Assets:Stocks', swing: 0.2 }],
			arcs: [arc],
			account: 'Assets:Stocks',
		});

		const chip = screen.getByText('Stocks').closest('a')!;
		expect(chip.textContent?.replace(/\s+/g, ' ').trim()).toBe('Stocks +10% a year, swings +20%');
		expect(chip.classList.contains('on')).toBe(true);
	});

	it('says it needs price history when no swing is known', () => {
		render(InvestedRisk, {
			invested: [row('Assets:Stocks', 0.1)],
			swings: [],
			arcs: [arc],
			account: null,
		});

		expect(screen.getByText('Needs price history.')).toBeTruthy();
	});

	it('says it needs price history when no return is known', () => {
		render(InvestedRisk, {
			invested: [row('Assets:Stocks', null)],
			swings: [{ account: 'Assets:Stocks', swing: 0.2 }],
			arcs: [arc],
			account: null,
		});

		expect(screen.getByText('Needs price history.')).toBeTruthy();
	});
});
