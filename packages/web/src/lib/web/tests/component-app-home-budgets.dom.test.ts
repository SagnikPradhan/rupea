import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { parseAmount } from '@rupea/shared/money.ts';
import HomeBudgets from '#lib/web/components/app-home-budgets/app-home-budgets.svelte';
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

const props = (budgets: BudgetView[]) => ({
	rows: rowsFor(budgets, 'Expenses'),
	today: on('2026-01-16'),
	handle: 'h',
});

const names = () => screen.queryAllByRole('link').map((l) => l.textContent?.trim() ?? '');

describe('the budgets glance on home', () => {
	it('shows how far every budget has gone, those over or running out first', () => {
		render(
			HomeBudgets,
			props([
				budget('Expenses:Rent', '10000', '5000'),
				budget('Expenses:Food', '8000', '12000'),
				budget('Expenses:Fuel', '4000', '3800'),
				budget('Expenses:Fun', '4000', '400'),
			]),
		);

		expect(screen.getByText('Budgets this month')).toBeTruthy();
		expect(names().map((n) => n.split(/\s/)[0])).toEqual(['Food', 'Fuel', 'Rent', 'Fun']);
		expect(screen.getByText(/4K over/)).toBeTruthy();
		expect(screen.getByText(/3.6K left/)).toBeTruthy();
	});

	it('shows nothing on a ledger without budgets', () => {
		render(HomeBudgets, props([]));

		expect(screen.queryByText('Budgets this month')).toBeNull();
	});
});
