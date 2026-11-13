import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listDailyDeltas, listDeltas } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import { openFilter } from '#tests/shared/filter.ts';
import Page from '#routes/(signed-in)/l/[handle]/expenses/+page.svelte';
import { type Amount, parseAmount } from '@rupea/shared/amounts.ts';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listDailyDeltas: vi.fn(),
	listDeltas: vi.fn(),
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

describe('the expenses page', () => {
	it('draws a calendar of what was averaged on each day of the month', async () => {
		visit('/l/h/expenses?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, previous]));
		vi.mocked(listDailyDeltas).mockReturnValue(
			answer(Array.from({ length: 31 }, (_, i) => ({ day: i + 1, amount: '10', unpriced: 0 }))),
		);
		render(Page, { data });

		const calendar = await screen.findByRole('table', {
			name: 'Average spending on each day of the month, over the period',
		});
		expect(within(calendar).getAllByRole('cell')).toHaveLength(35);
	});

	it('lists each account with its share, and links to its postings over the period picked', async () => {
		visit('/l/h/expenses?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, previous]));
		render(Page, { data });

		const food = await screen.findByTitle('Expenses:Food');
		expect(food.getAttribute('href')).toBe('/l/h/postings?account=Expenses%3AFood&at=2026');
		expect(screen.getByText('60%')).toBeTruthy();
		expect(screen.getAllByText('1 unpriced')).toHaveLength(2);
	});

	it('draws what came in flowing into what was spent and what was kept, over all expenses', async () => {
		visit('/l/h/expenses?at=2026');
		const income = {
			...spending,
			totals: [
				{
					account: 'Income',
					parent: null,
					first: '2026-01-03',
					amount: amount('-3000'),
					unpriced: 0,
				},
				{
					account: 'Income:Salary',
					parent: 'Income',
					first: '2026-01-03',
					amount: amount('-3000'),
					unpriced: 0,
				},
			],
		};
		vi.mocked(listDeltas).mockImplementation(({ account }) =>
			answer(account === 'Income' ? [income] : [spending, previous]),
		);
		render(Page, { data });

		expect(
			await screen.findByRole('img', {
				name: 'How what came in divides into what was spent and what was kept',
			}),
		).toBeTruthy();
		expect(vi.mocked(listDeltas)).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Income' }),
		);
	});

	it('folds the accounts under one until it is opened', async () => {
		visit('/l/h/expenses?at=2026');
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
		visit('/l/h/expenses');
		vi.mocked(listDeltas).mockReturnValue(answer([]));
		render(Page, { data });

		expect(await screen.findByText('Nothing spent in this period.')).toBeTruthy();
	});

	it('shows a month as a calendar of days, with no monthly rate', async () => {
		visit('/l/h/expenses?at=2026-01');
		vi.mocked(listDeltas).mockReturnValue(answer([{ ...spending, bucket: 'day' }]));
		render(Page, { data });

		await screen.findByTitle('Expenses:Food');
		expect(screen.queryByRole('columnheader', { name: 'Per month' })).toBeNull();
	});

	it('narrows to an account, listing it and those under it against its own total', async () => {
		visit('/l/h/expenses?account=Expenses:Food');
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
		visit('/l/h/expenses');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });
		await openFilter();

		const all = within(await screen.findByRole('navigation', { name: 'Accounts' })).getByRole(
			'link',
			{
				name: 'All accounts',
			},
		);
		expect(all.getAttribute('href')).toBe('?');
	});

	it('draws how the spending divides beside the spending over time', async () => {
		visit('/l/h/expenses');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });

		expect(await screen.findByRole('img', { name: /^How Expenses divides/ })).toBeTruthy();
		expect(screen.getByRole('img', { name: /^Spending from/ })).toBeTruthy();
	});

	it('sums up the month under the pointer against the same month before', async () => {
		Element.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width: 100, height: 100 });
		visit('/l/h/expenses?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, previous]));
		render(Page, { data });

		const plot = await screen.findByRole('img', { name: /^Spending from/ });
		await fireEvent.pointerMove(plot, { clientX: 25, clientY: 0 });
		const line = screen.getByText(/vs previous/).parentElement;
		expect(line?.textContent).toContain('Jan 2026');
	});

	it('rises from nothing, with no percent, when the period before spent nothing there', async () => {
		visit('/l/h/expenses?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, { ...previous, totals: [] }]));
		render(Page, { data });

		const change = await screen.findByText(/vs previous/);
		expect(change.textContent).not.toContain('(');
	});

	it('offers an account deeper than the groups as a choice of its own', async () => {
		visit('/l/h/expenses?account=Expenses:Food:Dining');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });
		await openFilter();

		const choices = within(await screen.findByRole('navigation', { name: 'Accounts' }));
		expect(choices.getByRole('link', { name: 'Dining' })).toBeTruthy();
	});

	it('reads the months before today for a span', async () => {
		visit('/l/h/expenses?span=3&account=Expenses:Food');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });

		await screen.findByTitle('Expenses:Food');
		expect(vi.mocked(listDeltas)).toHaveBeenCalledWith(
			expect.objectContaining({ period: expect.objectContaining({ kind: 'custom' }) }),
		);
	});

	it('names the account under it that took the most as the largest', async () => {
		visit('/l/h/expenses');
		const total = (account: string, value: string) => ({
			account,
			parent: account === 'Expenses' ? null : 'Expenses',
			first: '2026-01-03',
			amount: amount(value),
			unpriced: 0,
		});
		const totals = [
			total('Expenses', '1000'),
			total('Expenses:Bills', '100'),
			total('Expenses:Rent', '900'),
		];
		vi.mocked(listDeltas).mockReturnValue(answer([{ ...spending, totals }]));
		render(Page, { data });

		await screen.findByTitle('Expenses:Rent');
		const strip = within(screen.getByRole('region', { name: 'Figures' }));
		expect(strip.getByText('Rent')).toBeTruthy();
	});

	it('marks no span when the link asks for a period of its own', async () => {
		visit('/l/h/expenses?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });
		await openFilter();

		const spans = within(await screen.findByRole('navigation', { name: 'Period' }));
		expect(spans.getAllByRole('link').some((l) => l.hasAttribute('aria-current'))).toBe(false);
	});

	it('shows what went wrong reading the days of the month', async () => {
		visit('/l/h/expenses?at=2026');
		vi.mocked(listDeltas).mockReturnValue(answer([spending, previous]));
		vi.mocked(listDailyDeltas).mockReturnValue(
			answer(undefined, [{ type: 'ParseInvalidPosting', location: 'main.ledger:3' }]),
		);
		render(Page, { data });

		expect(await screen.findByText(/This posting can’t be read\./)).toBeTruthy();
	});

	it('shows what went wrong reading what came in', async () => {
		visit('/l/h/expenses?at=2026');
		vi.mocked(listDailyDeltas).mockReturnValue(answer([]));
		vi.mocked(listDeltas).mockImplementation(({ account }) =>
			account === 'Income'
				? answer(undefined, [{ type: 'ParseMissingTransactionBody', location: 'main.ledger:5' }])
				: answer([spending, previous]),
		);
		render(Page, { data });

		expect(await screen.findByText(/This transaction has no postings\./)).toBeTruthy();
	});

	it('says so when nothing lies under the account', async () => {
		visit('/l/h/expenses?account=Expenses:Rent');
		vi.mocked(listDeltas).mockReturnValue(answer([spending]));
		render(Page, { data });

		expect(await screen.findByText('Nothing under Rent to divide.')).toBeTruthy();
		expect(screen.getByRole('navigation', { name: 'Scale' })).toBeTruthy();
	});
});
