import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Donut from '#lib/web/components/ui-chart-donut/ui-chart-donut.svelte';
import { ringsOf } from '#lib/web/shared/rings.ts';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';
const amount = (t: string) => parseAmount(t) as Amount;

const held = (account: string, parent: string | null, total: number) => ({
	account,
	parent,
	total: amount(String(total)),
});

const RINGS = ringsOf([
	held('Assets', null, 100),
	held('Assets:Investments', 'Assets', 75),
	held('Assets:Investments:Gold', 'Assets:Investments', 50),
	held('Assets:Investments:Equity', 'Assets:Investments', 25),
	held('Assets:Bank', 'Assets', 25),
]);

const drawn = (note?: string) => {
	render(Donut, { arcs: RINGS.arcs, levels: RINGS.levels, label: 'Assets', note });
	return screen.getByRole('img', { name: 'Assets' });
};

describe('the donut chart', () => {
	it('draws an arc for each account in each ring, and lists each account once with its share, a sub-account behind its parent initials', () => {
		const plot = drawn();

		expect(plot.querySelectorAll('path')).toHaveLength(5);
		expect(
			screen.getAllByRole('listitem').map((l) => l.textContent?.replace(/\s+/g, ' ').trim()),
		).toEqual(['Investments 75%', 'A:I:Gold 50%', 'A:I:Equity 25%', 'Bank 25%']);
	});

	it('names the arc under the cursor in a tip, fading the other groups, until it leaves', async () => {
		const plot = drawn();
		const gold = plot.querySelectorAll('path')[1] as Element;

		await fireEvent.pointerEnter(gold);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toMatch(/Gold\s*50/);
		expect(plot.querySelectorAll('path.faded')).toHaveLength(2);

		await fireEvent.pointerLeave(gold);
		expect(plot.querySelector('[role="tooltip"]')).toBeNull();
	});

	it('says what it left out under the rings', () => {
		drawn('1 account is below zero, so not drawn');
		expect(screen.getByText('1 account is below zero, so not drawn')).toBeTruthy();
	});
});
