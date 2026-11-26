import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	listBudgets,
	listDailyDeltas,
	listDeltas,
	listInvested,
} from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import { openFilter } from '#tests/shared/filter.ts';
import Page from '#routes/(signed-in)/l/[handle]/spending/+page.svelte';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listBudgets: vi.fn(() => answer([])),
	listDailyDeltas: vi.fn(),
	listDeltas: vi.fn(),
	listInvested: vi.fn(() => answer([])),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
}));
const spending = {
	from: on('2026-01-01'),
	to: on('2026-02-28'),
	bucket: 'month',
	buckets: [on('2026-01-01'), on('2026-02-01')],
	totals: [
		{ account: 'Expenses', parent: null, first: '2026-01-03', amount: amount('1000'), unpriced: 1 },
		{
			account: 'Expenses:Food',
			parent: 'Expenses',
			first: '2026-01-03',
			amount: amount('600'),
			unpriced: 1,
		},
		{
			account: 'Expenses:Rent',
			parent: 'Expenses',
			first: '2026-02-01',
			amount: amount('400'),
			unpriced: 0,
		},
	],
	deltas: [
		{
			account: 'Expenses',
			bucket: on('2026-01-01'),
			first: '2026-01-03',
			amount: amount('600'),
			unpriced: 1,
		},
		{
			account: 'Expenses',
			bucket: on('2026-02-01'),
			first: '2026-02-01',
			amount: amount('400'),
			unpriced: 0,
		},
	],
};
const previous = { ...spending, from: on('2025-01-01'), buckets: [on('2025-01-01')] };

describe('the spending page', () => {
	it('draws a calendar of what was spent on each day', async () => {
		visit('/l/h/spending?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, previous]));
		vi.mocked(listDailyDeltas).mockReturnValue(
			answer(
				Array.from({ length: 31 }, (_, i) => ({
					day: `2026-01-${String(i + 1).padStart(2, '0')}`,
					amount: '10',
					unpriced: 0,
				})),
			),
		);
		render(Page, { data });

		const calendar = await screen.findByRole('table', {
			name: 'Spending on each day of the period',
		});
		expect(within(calendar).getAllByRole('cell')).toHaveLength(35);
	});

	it('lists each account with its share, and links to its postings over the period picked', async () => {
		visit('/l/h/spending?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, previous]));
		render(Page, { data });

		const food = await screen.findByTitle('Expenses:Food');
		expect(food.getAttribute('href')).toBe('/l/h/postings?account=Expenses%3AFood&at=2026');
		expect(screen.getByText('60%')).toBeTruthy();
		expect(screen.getAllByText('1 unpriced')).toHaveLength(2);
	});

	it('draws how the expenses divide', async () => {
		visit('/l/h/spending?at=2026');
		vi.mocked(listDeltas).mockImplementation(() => answer([spending, previous]));
		render(Page, { data });

		expect(await screen.findByRole('img', { name: /How Expenses divides into/ })).toBeTruthy();
	});

	it('folds the accounts under one until it is opened', async () => {
		visit('/l/h/spending?at=2026');
		const dining = {
			account: 'Expenses:Food:Dining',
			parent: 'Expenses:Food',
			first: '2026-01-03',
			amount: amount('200'),
			unpriced: 0,
		};
		const nested = { ...spending, totals: [...spending.totals, dining] };
		vi.mocked(listDeltas).mockReturnValue(answer([nested, previous]));
		render(Page, { data });

		const fold = await screen.findByRole('button', { name: 'Accounts under Food' });
		expect(fold.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByTitle('Expenses:Food:Dining')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Accounts under Rent' })).toBeNull();

		await fireEvent.click(fold);
		expect(fold.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByTitle('Expenses:Food:Dining')).toBeTruthy();

		await fireEvent.click(fold);
		expect(fold.getAttribute('aria-expanded')).toBe('false');
	});

	it('says when nothing was spent', async () => {
		visit('/l/h/spending');
		vi.mocked(listDeltas).mockReturnValue(answer([]));
		render(Page, { data });

		expect(await screen.findByText('Nothing spent in this period.')).toBeTruthy();
	});

	it('shows a month as a calendar of days, with no monthly rate', async () => {
		visit('/l/h/spending?at=2026-01');
		vi.mocked(listDeltas).mockReturnValue(answer([{ ...spending, bucket: 'day' }]));
		render(Page, { data });

		await screen.findByTitle('Expenses:Food');
		expect(screen.queryByRole('columnheader', { name: 'Per month' })).toBeNull();
	});

	it('narrows to an account, listing it and those under it against its own total', async () => {
		visit('/l/h/spending?account=Expenses:Food');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });

		await screen.findByTitle('Expenses:Food');
		expect(vi.mocked(listDeltas)).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Expenses:Food' }),
		);
		expect(screen.queryByTitle('Expenses')).toBeNull();
		expect(screen.queryByTitle('Expenses:Rent')).toBeNull();
	});

	it('picks from the accounts right under Expenses', async () => {
		visit('/l/h/spending');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });
		await openFilter();

		const all = within(await screen.findByRole('navigation', { name: 'Accounts' })).getByRole(
			'link',
			{
				name: 'All accounts',
			},
		);
		expect(all.getAttribute('href')).toBe('/l/h/spending');
	});

	it('draws how the spending divides beside the spending over time', async () => {
		visit('/l/h/spending');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });

		expect(await screen.findByRole('img', { name: /^How Expenses divides/ })).toBeTruthy();
		expect(screen.getByRole('img', { name: /^Spending from/ })).toBeTruthy();
	});

	it('gives no percent when the period before spent nothing', async () => {
		visit('/l/h/spending?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, { ...previous, totals: [] }]));
		render(Page, { data });

		await screen.findByRole('region', { name: 'Spending figures' });
		expect(screen.queryByText(/on the period before/)).toBeNull();
	});

	it('offers an account deeper than the groups as a choice of its own', async () => {
		visit('/l/h/spending?account=Expenses:Food:Dining');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });
		await openFilter();

		const choices = within(await screen.findByRole('navigation', { name: 'Accounts' }));
		expect(choices.getByRole('link', { name: 'Dining' })).toBeTruthy();
	});

	it('reads the months before today for a span', async () => {
		visit('/l/h/spending?span=3&account=Expenses:Food');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });

		await screen.findByTitle('Expenses:Food');
		expect(vi.mocked(listDeltas)).toHaveBeenCalledWith(
			expect.objectContaining({ period: expect.objectContaining({ kind: 'custom' }) }),
		);
	});

	it('marks no span when the link asks for a period of its own', async () => {
		visit('/l/h/spending?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });
		await openFilter();

		const spans = within(await screen.findByRole('navigation', { name: 'Period' }));
		expect(spans.getAllByRole('link').some((l) => l.hasAttribute('aria-current'))).toBe(false);
	});

	it('shows what went wrong reading the days of the month', async () => {
		visit('/l/h/spending?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, previous]));
		vi.mocked(listDailyDeltas).mockReturnValue(
			answer(undefined, [{ type: 'ParseInvalidPosting', location: 'main.ledger:3' }]),
		);
		render(Page, { data });

		expect(await screen.findByText(/This posting can’t be read\./)).toBeTruthy();
	});

	it('says so when nothing lies under the account', async () => {
		visit('/l/h/spending?account=Expenses:Rent');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });

		expect(await screen.findByText('Nothing under Rent to divide.')).toBeTruthy();
		expect(screen.getByRole('navigation', { name: 'Scale' })).toBeTruthy();
	});

	describe('the budgets', () => {
		const budget = (account: string, limit: string, spent: string) => ({
			account,
			length: 'month',
			from: on('2026-01-01'),
			to: on('2026-01-31'),
			limit: amount(limit),
			spent: amount(spent),
			left: amount('0'),
			current: {},
		});

		it('lists them in the panel and counts the ones over in the figures', async () => {
			visit('/l/h/spending');
			vi.mocked(listDeltas).mockReturnValue(answer([spending]));
			vi.mocked(listBudgets).mockReturnValue(
				answer([budget('Expenses:Food', '100', '150'), budget('Expenses:Rent', '500', '100')]),
			);
			render(Page, { data });

			expect(await screen.findByText('50 over')).toBeTruthy();
			expect(screen.getByText('150 of 100')).toBeTruthy();
			expect(screen.getByText('400 left')).toBeTruthy();
			expect(screen.getByText('1 of 2')).toBeTruthy();
		});

		it('reads the budgets over the period shown, from its first day to its last', async () => {
			visit('/l/h/spending?at=2025-09');
			vi.mocked(listBudgets).mockClear();
			vi.mocked(listDeltas).mockReturnValue(answer([spending]));
			render(Page, { data });

			await screen.findByText('Budgets');
			expect(vi.mocked(listBudgets)).toHaveBeenCalledWith({
				handle: 'h',
				from: '2025-09-01',
				day: '2025-09-30',
			});
		});

		it('reads a year back from today as its twelve months, from the day a year ago', async () => {
			visit('/l/h/spending');
			vi.mocked(listBudgets).mockClear();
			vi.mocked(listDeltas).mockReturnValue(answer([spending]));
			render(Page, { data });

			await screen.findByText('Budgets');
			const today = Temporal.Now.plainDateISO().toString();
			const call = vi.mocked(listBudgets).mock.calls[0]?.[0];
			expect(call?.day).toBe(today);
			expect(call?.from).toBe(Temporal.PlainDate.from(today).subtract({ months: 12 }).toString());
		});

		it('says there are none when none are set', async () => {
			visit('/l/h/spending');
			vi.mocked(listDeltas).mockReturnValue(answer([spending]));
			vi.mocked(listBudgets).mockReturnValue(answer([]));
			render(Page, { data });

			expect(await screen.findByText('No budgets yet. Add one to see what is left.')).toBeTruthy();
			expect(screen.queryByText('Budgets over')).toBeNull();
		});

		it('links Add budget to settings', async () => {
			visit('/l/h/spending?at=2026');
			render(Page, { data });

			const link = await screen.findByRole('link', { name: 'Add budget' });
			expect(link.getAttribute('href')).toBe('/settings?ledger=h&add=budget#h-budgets');
			expect(screen.queryByRole('complementary')).toBeNull();
		});

		it('shows what went wrong reading them', async () => {
			visit('/l/h/spending');
			vi.mocked(listDeltas).mockReturnValue(answer([spending]));
			vi.mocked(listBudgets).mockReturnValue(
				answer(undefined, [{ type: 'ParseInvalidPosting', location: 'main.ledger:3' }]),
			);
			render(Page, { data });

			expect(await screen.findByText(/This posting can’t be read\./)).toBeTruthy();
		});
	});
});

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

const dated = <R>(r: R, from: string) => ({ ...r, from: on(from) });

const earned = range('Income', [
	['Income', null, '-2000'],
	['Income:Salary', 'Income', '-1800'],
	['Income:Dividends', 'Income', '-200'],
]);
const outgoing = range('Expenses', [['Expenses', null, '1000']]);

describe('the income on the spending page', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
		visit('/l/h/spending');
		vi.mocked(listInvested).mockReturnValue(
			answer([
				{ day: '2026-08-31', value: '600', cost: '500' },
				{ day: '2026-09-30', value: '1100', cost: '900' },
				{ day: '2026-10-31', value: '6000', cost: '5000' },
			]),
		);
		vi.mocked(listDeltas).mockImplementation(({ account, period }) => {
			const whole = account === 'Income' ? earned : outgoing;

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

		expect(await screen.findByRole('heading', { level: 1, name: 'Spending' })).toBeTruthy();
		expect(screen.getByText('Where did your income go?')).toBeTruthy();
	});

	it('reads income over the period only', async () => {
		render(Page, { data });
		await screen.findByRole('heading', { name: 'Where the money came from' });

		expect(listDeltas).not.toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-10' } }),
		);
		expect(listDeltas).toHaveBeenCalledWith(
			expect.objectContaining({
				account: 'Income',
				period: { kind: 'custom', from: '2025-11-16', to: '2026-11-16' },
			}),
		);
	});

	it('draws income by month, split into what was spent, invested and kept', async () => {
		render(Page, { data });

		expect(
			await screen.findByRole('img', {
				name: /^Income from .*, 2,000 in all, 1,000 spent, 1,000 invested, 0 kept$/,
			}),
		).toBeTruthy();
	});

	it('lists each source as the spending is listed, by what it earned', async () => {
		render(Page, { data });

		const heading = await screen.findByRole('heading', { name: 'Where the money came from' });
		const table = within(heading.closest('section') as HTMLElement);
		expect(table.getByRole('link', { name: 'Salary' })).toBeTruthy();
		expect(table.getByRole('link', { name: 'Dividends' })).toBeTruthy();
		expect(table.getByText('Earned')).toBeTruthy();
		expect(table.getByRole('img', { name: /How Income divides/ })).toBeTruthy();
	});

	it('names a period of its own', async () => {
		visit('/l/h/spending?at=2026-03');
		render(Page, { data });

		await screen.findByRole('heading', { name: 'Where the money came from' });
		expect(listDeltas).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Income', period: { kind: 'month', at: '2026-03' } }),
		);
	});

	it('offers the periods to read in the filter, with the one picked marked', async () => {
		visit('/l/h/spending?span=3');
		render(Page, { data });

		const dialog = within(await openFilter());
		expect(dialog.getByRole('link', { name: '12M' })).toBeTruthy();
		expect(dialog.getByRole('link', { name: '3M' }).getAttribute('aria-current')).toBeTruthy();
	});

	it('sums up the month under the pointer as income and the shares saved, invested and kept', async () => {
		Element.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width: 100, height: 100 });
		render(Page, { data });

		const plot = await screen.findByRole('img', { name: /^Income from .*kept$/ });
		await fireEvent.pointerMove(plot, { clientX: 25, clientY: 0 });

		expect(screen.getByText(/kept ·/).textContent).toMatch(
			/50% saved:\s+20% invested,\s+30% kept ·/,
		);
		expect(screen.getByText(/kept ·/).textContent).toContain('Sept 2026');
	});

	it('reads what was paid for lots from the day before the period', async () => {
		render(Page, { data });
		await screen.findByRole('heading', { name: 'Where the money came from' });

		expect(listInvested).toHaveBeenCalledWith(
			expect.objectContaining({
				account: 'Assets',
				period: { kind: 'custom', from: '2025-11-15', to: '2026-11-16' },
			}),
		);
	});

	it('reads all of time as it is, with nothing paid before it', async () => {
		visit('/l/h/spending?range=all');
		render(Page, { data });
		await screen.findByRole('heading', { name: 'Where the money came from' });

		expect(listInvested).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'all' }, account: 'Assets' }),
		);
	});

	it('names a year bucket by its year, not as the January it starts on', async () => {
		Element.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width: 100, height: 100 });
		visit('/l/h/spending?range=all');
		const yearly = <R>(r: R) => ({
			...r,
			bucket: 'year',
			buckets: [on('2025-01-01'), on('2026-01-01')],
		});
		vi.mocked(listDeltas).mockImplementation(({ account }) =>
			answer([yearly(account === 'Income' ? earned : outgoing)]),
		);
		render(Page, { data });

		const plot = await screen.findByRole('img', { name: /^Income from .*kept$/ });
		await fireEvent.pointerMove(plot, { clientX: 25, clientY: 0 });

		expect(screen.getByText(/kept ·/).textContent).toMatch(/·\s+2025/);
		expect(screen.getByText(/kept ·/).textContent).not.toContain('Jan');
	});
});
