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

const PROPS = {
	spending: SPENDING,
	account: 'Expenses',
	first: on('2026-01-01'),
	last: on('2026-01-10'),
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

	it('counts one day in the singular and several in the plural', () => {
		const { unmount } = render(SpendingKpis, { ...PROPS, last: on('2026-01-01') });

		expect(screen.getByText('1 day')).toBeTruthy();
		unmount();

		render(SpendingKpis, PROPS);
		expect(screen.getByText('10 days')).toBeTruthy();
	});

	it('names the largest account under and its share', () => {
		render(SpendingKpis, PROPS);

		expect(screen.getByText('Food')).toBeTruthy();
		expect(screen.getByText(/of spending/).textContent).toContain('25%');
	});

	it('shows a dash when no account is under', () => {
		render(SpendingKpis, { ...PROPS, account: 'Expenses:Food' });

		expect(screen.getAllByText('–')).toHaveLength(2);
		expect(screen.queryByText(/of spending/)).toBeNull();
	});

	it('names the budgets over, as a count of all', () => {
		const budgets = rowsFor(
			[budget('Expenses:Food', '100', '150'), budget('Expenses:Rent', '500', '100')],
			'Expenses',
		);
		render(SpendingKpis, { ...PROPS, budgets });

		expect(screen.getByText('1 of 2')).toBeTruthy();
		expect(screen.getAllByText('Food')).toHaveLength(2);
	});

	it('shows a dash and none set without budgets', () => {
		render(SpendingKpis, PROPS);

		expect(screen.getByText('None set')).toBeTruthy();
	});
});
