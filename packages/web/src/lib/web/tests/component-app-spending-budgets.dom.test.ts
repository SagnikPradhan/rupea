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

const BUDGETS = [
	budget('Expenses:Rent', '10000', '5000'),
	budget('Expenses:Food', '8000', '12000'),
];

const props = (budgets: BudgetView[]) => ({ rows: rowsFor(budgets, 'Expenses') });

describe('the budgets panel', () => {
	it('titles itself and says how many are over', () => {
		render(SpendingBudgets, props(BUDGETS));

		expect(screen.getByText('Budgets')).toBeTruthy();
		expect(screen.getByText('2 budgets · 1 over')).toBeTruthy();
	});

	it('lists the rows in order with spent of limit and the percent', () => {
		render(SpendingBudgets, props(BUDGETS));

		const items = screen.getAllByRole('listitem');

		expect(items.map((i) => i.querySelector('.name')?.textContent)).toEqual(['Food', 'Rent']);
		expect(screen.getByText('12,000 of 8,000')).toBeTruthy();
		expect(screen.getByText('5,000 of 10,000')).toBeTruthy();
		expect(screen.getByText('150%')).toBeTruthy();
		expect(screen.getByText('50%')).toBeTruthy();
	});

	it('marks only the over row negative', () => {
		render(SpendingBudgets, props(BUDGETS));

		expect(screen.getByText('150%').className).toContain('negative');
		expect(screen.getByText('50%').className).not.toContain('negative');
	});

	it('links each name to its budget', () => {
		render(SpendingBudgets, props(BUDGETS));

		expect(screen.getByText('Food').closest('a')?.getAttribute('href')).toBe(
			'?budget=Expenses%3AFood',
		);
	});

	it('draws a limit tick on each bar', () => {
		const { container } = render(SpendingBudgets, props(BUDGETS));

		expect(container.querySelectorAll('.tick')).toHaveLength(2);
	});

	it('says there are none without rows', () => {
		render(SpendingBudgets, props([]));

		expect(screen.getByText('No budgets yet. Add one to see what is left.')).toBeTruthy();
		expect(screen.queryAllByRole('listitem')).toHaveLength(0);
	});

	it('shows an en dash when the limit is zero', () => {
		render(SpendingBudgets, props([budget('Expenses:Food', '0', '100')]));

		expect(screen.getByText('–')).toBeTruthy();
	});
});
