import { render, screen } from '@testing-library/svelte';
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
	[...document.querySelectorAll<HTMLElement>('.fill')].map((fill) => fill.style.width);

describe('the invested returns', () => {
	it('nests accounts under their group', () => {
		render(InvestedReturns, {
			invested: [
				row('Assets:Stocks', 300, null),
				row('Assets:Gold', 100, null),
				row('Assets:Stocks:Index', 200, null),
			],
		});

		const names = [...document.querySelectorAll('.name')].map((n) => n.lastChild?.textContent);

		expect(names).toEqual(['Stocks', 'Index', 'Gold']);
	});

	it('measures the share against the best rate', () => {
		render(InvestedReturns, {
			invested: [row('Assets:Stocks', 400, null), row('Assets:Gold', 200, null)],
		});

		expect(widths()).toEqual(['100%', '50%']);
	});

	it('measures the share against the base growth when every rate is below it', () => {
		render(InvestedReturns, {
			invested: [row('Assets:Stocks', 60, null), row('Assets:Gold', 30, null)],
		});

		expect(widths()).toEqual(['50%', '25%']);
	});

	it('shows the xirr only when there is one', () => {
		render(InvestedReturns, {
			invested: [row('Assets:Stocks', 200, 0.1), row('Assets:Gold', 100, null)],
		});

		expect(screen.getAllByText(/a year$/)).toHaveLength(1);
	});

	it('tones a negative gain negative and a positive one positive', () => {
		render(InvestedReturns, {
			invested: [row('Assets:Stocks', 200, null), row('Assets:Gold', -100, null)],
		});

		expect(document.querySelectorAll('.figure.positive')).toHaveLength(1);
		expect(document.querySelectorAll('.figure.negative')).toHaveLength(1);
	});

	it('tones a zero gain neither way', () => {
		render(InvestedReturns, { invested: [row('Assets:Stocks', 0, null)] });

		expect(document.querySelectorAll('.figure')).toHaveLength(1);
		expect(document.querySelectorAll('.figure.positive, .figure.negative')).toHaveLength(0);
	});
});
