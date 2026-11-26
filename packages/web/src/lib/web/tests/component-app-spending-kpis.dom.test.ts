import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';
import { type BudgetView, rowsFor } from '#lib/web/shared/budgets.ts';
import SpendingKpis from '#lib/web/components/app-spending-kpis/app-spending-kpis.svelte';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

const SPENDING = {
	buckets: [on('2026-01-01')],
	totals: [
		{ account: 'Expenses', parent: null, amount: amount('1000'), unpriced: 0 },
		{ account: 'Expenses:Food', parent: 'Expenses', amount: amount('250'), unpriced: 0 },
	],
	deltas: [],
};

const INCOME = {
	buckets: [on('2026-01-01')],
	totals: [{ account: 'Income', parent: null, amount: amount('-4000'), unpriced: 0 }],
	deltas: [],
};

const PROPS = {
	spending: SPENDING,
	income: INCOME,
	expenses: SPENDING,
	account: 'Expenses',
	first: on('2026-01-01'),
	last: on('2026-01-31'),
	moved: null,
	budgets: [],
};

const budget = (account: string, limit: string, spent: string) =>
	({
		account,
		length: 'month',
		from: on('2026-01-01'),
		to: on('2026-01-31'),
		limit: amount(limit),
		spent: amount(spent),
		left: amount('0'),
		current: {},
	}) as BudgetView;

describe('the spending KPIs', () => {
	it('shows the Spent percent only when moved has one', () => {
		const { unmount } = render(SpendingKpis, PROPS);

		expect(screen.queryByText(/on the period before/)).toBeNull();
		unmount();

		render(SpendingKpis, {
			...PROPS,
			moved: { amount: '+250', percent: '+25%', negative: false },
		});
		expect(screen.getByText('+25% on the period before')).toBeTruthy();
	});

	it('shows what was spent a day, and what was saved out of what was earned', () => {
		render(SpendingKpis, PROPS);

		expect(screen.getByText('A day').nextElementSibling?.textContent).toBe('32');
		expect(screen.getByText('31 days')).toBeTruthy();
		expect(screen.getByText('Saved').nextElementSibling?.textContent).toBe('3,000');
		expect(screen.getByText('75% of income')).toBeTruthy();
	});

	it('saves what all expenses left, whatever account is shown', () => {
		render(SpendingKpis, { ...PROPS, account: 'Expenses:Food' });

		expect(screen.getByText('Spent').nextElementSibling?.textContent).toBe('250');
		expect(screen.getByText('Saved').nextElementSibling?.textContent).toBe('3,000');
	});

	it('names the budgets over, as a count of all', () => {
		const budgets = rowsFor(
			[budget('Expenses:Food', '100', '150'), budget('Expenses:Rent', '500', '100')],
			'Expenses',
		);
		render(SpendingKpis, { ...PROPS, budgets });

		expect(screen.getByText('1 of 2')).toBeTruthy();
		expect(screen.getByText('Food')).toBeTruthy();
	});

	it('shows a dash and none set without budgets', () => {
		render(SpendingKpis, PROPS);

		expect(screen.getByText('None set')).toBeTruthy();
	});
});
