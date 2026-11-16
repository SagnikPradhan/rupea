import { render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDeltas } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/income/+page.svelte';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({ listDeltas: vi.fn() }));

const range = (account: string, totals: [string, string | null, string][]) => ({
	from: on('2026-01-01'),
	to: on('2026-10-31'),
	bucket: 'month',
	buckets: [on('2026-09-01'), on('2026-10-01')],
	totals: totals.map(([name, parent, total]) => ({
		account: name,
		parent,
		amount: amount(total),
		unpriced: 0,
	})),
	deltas: [
		{ account, bucket: on('2026-09-01'), amount: amount(totals[0]?.[2] ?? '0') },
		{ account, bucket: on('2026-10-01'), amount: amount(totals[0]?.[2] ?? '0') },
	],
});

const dated = (r: ReturnType<typeof range>, from: string) => ({ ...r, from: on(from) });

const earned = range('Income', [
	['Income', null, '-2000'],
	['Income:Salary', 'Income', '-1800'],
	['Income:Dividends', 'Income', '-200'],
]);
const spent = range('Expenses', [['Expenses', null, '1000']]);

describe('the income page', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
		visit('/l/h/income');
		vi.mocked(listDeltas).mockImplementation(({ account, period }) => {
			const whole = account === 'Income' ? earned : spent;

			return answer(
				period.kind === 'month'
					? [dated(whole, '2026-10-01'), dated(whole, '2026-09-01')]
					: [whole],
			);
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('titles the page and says what it answers', async () => {
		render(Page, { data });

		expect(await screen.findByRole('heading', { level: 1, name: 'Income' })).toBeTruthy();
		expect(screen.getByText('Where money comes in, and how much of it you keep')).toBeTruthy();
	});

	it('reads income and spending over the period and over last month', async () => {
		render(Page, { data });
		await screen.findByText('Income in October');

		expect(listDeltas).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Income', period: { kind: 'month', at: '2026-10' } }),
		);
		expect(listDeltas).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Expenses', period: { kind: 'month', at: '2026-10' } }),
		);
		expect(listDeltas).toHaveBeenCalledWith(
			expect.objectContaining({
				account: 'Income',
				period: { kind: 'custom', from: '2025-11-16', to: '2026-11-16' },
			}),
		);
	});

	it('shows last month as what came in, what was kept, what investments paid and what they cover', async () => {
		render(Page, { data });

		const figures = within(await screen.findByLabelText('Figures'));
		expect(figures.getByText('Income in October')).toBeTruthy();
		expect(figures.getByText('2,000')).toBeTruthy();
		expect(figures.getByText('50%')).toBeTruthy();
		expect(figures.getByText('1,000 kept')).toBeTruthy();
		expect(figures.getByText('From investments')).toBeTruthy();
		expect(figures.getByText('10% of income')).toBeTruthy();
		expect(figures.getByText('20%')).toBeTruthy();
		expect(figures.getByText('200 of 1,000')).toBeTruthy();
	});

	it('draws income by month, split into what was spent and what was kept', async () => {
		render(Page, { data });

		expect(
			await screen.findByRole('img', { name: /^Income from .*, 2,000 in all, 1,000 kept$/ }),
		).toBeTruthy();
	});

	it('lists each source for last month and over the period, with the total', async () => {
		render(Page, { data });

		const table = within(await screen.findByRole('table', { name: '' }));
		expect(table.getByText('Salary')).toBeTruthy();
		expect(table.getByText('Dividends')).toBeTruthy();
		expect(table.getByText('Last 12 months')).toBeTruthy();
	});

	it('shows no saving rate or cover while the spending cannot be read', async () => {
		vi.mocked(listDeltas).mockImplementation(({ account }) =>
			answer(account === 'Income' ? [earned, earned] : undefined),
		);
		render(Page, { data });

		const figures = within(await screen.findByLabelText('Figures'));
		expect(figures.getAllByText('–')).toHaveLength(2);
		expect(figures.queryByText('100%')).toBeNull();
	});
});
