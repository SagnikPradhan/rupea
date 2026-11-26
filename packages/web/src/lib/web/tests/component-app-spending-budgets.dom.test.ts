import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { parseAmount } from '@rupea/shared/money.ts';
import SpendingBudgets from '#lib/web/components/app-spending-budgets/app-spending-budgets.svelte';
import { type BudgetView, rowsFor } from '#lib/web/shared/budgets.ts';

const on = (d: string) => Temporal.PlainDate.from(d);

const budget = (account: string, limit: string, spent: string) =>
	({
		account,
		length: 'month',
		from: on('2026-01-01'),
		to: on('2026-01-31'),
		limit: parseAmount(limit),
		spent: parseAmount(spent),
		left: parseAmount('0'),
		current: {},
	}) as BudgetView;

const TODAY = on('2026-01-16');

const BUDGETS = [
	budget('Expenses:Rent', '10000', '5000'),
	budget('Expenses:Food', '8000', '12000'),
	budget('Expenses:Fuel', '4000', '3800'),
	budget('Expenses:Fun', '4000', '400'),
];

const props = (budgets: BudgetView[]) => ({
	rows: rowsFor(budgets, 'Expenses'),
	today: TODAY,
	handle: 'h',
});

describe('the budgets panel', () => {
	it('titles itself and asks which are running out', () => {
		render(SpendingBudgets, props(BUDGETS));

		expect(screen.getByText('Budgets')).toBeTruthy();
		expect(screen.getByText('Which budgets are running out?')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Add budget' }).getAttribute('href')).toBe(
			'/settings?ledger=h&add=budget#h-budgets',
		);
	});

	it('leads with what is left, over budgets first, then those spending ahead, then the rest', () => {
		render(SpendingBudgets, props(BUDGETS));

		const items = screen.getAllByRole('listitem');

		expect(items.map((i) => i.querySelector('a')?.textContent?.trim())).toEqual([
			'Food',
			'Fuel',
			'Rent',
			'Fun',
		]);
		expect(screen.getByText('4K over')).toBeTruthy();
		expect(screen.getByText('200 left')).toBeTruthy();
		expect(screen.getByText('5K left')).toBeTruthy();
		expect(screen.getByText('12K of 8K')).toBeTruthy();
	});

	it('marks only the over row negative', () => {
		render(SpendingBudgets, props(BUDGETS));

		expect(screen.getByText('4K over').className).toContain('negative');
		expect(screen.getByText('200 left').className).not.toContain('negative');
	});

	it('totals what was spent of the limits, and what is left or over', () => {
		render(SpendingBudgets, props(BUDGETS));

		expect(screen.getByText('Spent').nextElementSibling?.textContent).toBe('21,200');
		expect(screen.getByText('of 26,000 allowed')).toBeTruthy();
		expect(screen.getByText('Left').nextElementSibling?.textContent).toBe('4,800');
		expect(screen.getByText('82% of limits used')).toBeTruthy();
	});

	it('links each name to its budget', () => {
		render(SpendingBudgets, props(BUDGETS));

		expect(screen.getByText('Food').closest('a')?.getAttribute('href')).toBe(
			'/settings?ledger=h&budget=Expenses%3AFood#h-budgets',
		);
	});

	it('draws a bar for each budget, amber when ahead of pace and red past the limit', () => {
		const { container } = render(SpendingBudgets, props(BUDGETS));

		expect(container.querySelectorAll('.track')).toHaveLength(4);
		expect(container.querySelectorAll('.bar.warn')).toHaveLength(1);
		expect(container.querySelectorAll('.bar.negative')).toHaveLength(1);
		expect(container.querySelectorAll('.today')).toHaveLength(4);
	});

	it('says there are none without rows', () => {
		render(SpendingBudgets, props([]));

		expect(screen.getByText('No budgets yet. Add one to see what is left.')).toBeTruthy();
		expect(screen.queryAllByRole('listitem')).toHaveLength(0);
	});
});
