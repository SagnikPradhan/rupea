import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import InvestedReturns from '#lib/web/components/app-invested-returns/app-invested-returns.svelte';

const row = (account: string, gain: number, xirr: number | null) => ({
	account,
	name: account.split(':').at(-1) ?? account,
	value: 1000 + gain,
	cost: 1000,
	gain,
	gainRate: gain / 1000,
	netIn: 900,
	xirr,
});

const widths = () =>
	[...document.querySelectorAll<HTMLElement>('.bar')].map((bar) => bar.style.width);

describe('the invested returns', () => {
	it('sorts accounts by depth, then name', () => {
		render(InvestedReturns, {
			invested: [
				row('Assets:Stocks', 300, null),
				row('Assets:Gold', 100, null),
				row('Assets:Stocks:Index', 200, null),
			],
		});

		const names = [...document.querySelectorAll('.name')].map((n) => n.textContent);

		expect(names).toEqual(['A:Gold', 'A:Stocks', 'A:S:Index']);
	});

	it('draws one bar per account, as long as its rate', () => {
		render(InvestedReturns, {
			invested: [row('Assets:Stocks', 400, null), row('Assets:Gold', 200, null)],
		});

		expect(widths()).toEqual(['50%', '100%']);
	});

	it('draws a fall as a negative bar', () => {
		render(InvestedReturns, {
			invested: [row('Assets:Stocks', 200, null), row('Assets:Gold', -100, null)],
		});

		expect(document.querySelectorAll('.bar.negative')).toHaveLength(1);
	});

	it('draws an axis from nothing to the best rate', () => {
		render(InvestedReturns, { invested: [row('Assets:Stocks', 400, null)] });

		const labels = [...document.querySelectorAll('.across')].map((t) => t.textContent);

		expect(labels).toEqual(['0%', '+10%', '+20%', '+30%', '+40%']);
	});

	it('shows the xirr instead when asked, and none for an account without one', async () => {
		render(InvestedReturns, {
			invested: [row('Assets:Stocks', 200, 0.1), row('Assets:Gold', 100, null)],
		});

		await userEvent.setup().click(screen.getByRole('button', { name: 'XIRR' }));

		expect(document.querySelectorAll('.bar')).toHaveLength(1);
		expect(screen.getByText('–')).toBeTruthy();
	});
});
