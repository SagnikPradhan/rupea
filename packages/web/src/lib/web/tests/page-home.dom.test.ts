import { render, screen, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findBridge, listHoldings, listDeltas, listWorth } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/+page.svelte';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	findBridge: vi.fn(),
	listHoldings: vi.fn(),
	listDeltas: vi.fn(),
	listWorth: vi.fn(),
}));

const amount = (t: string) => parseAmount(t) as Amount;

const account = (name: string, parent: string | null, total: string) => ({
	account: name,
	parent,
	total: amount(total),
	cost: null,
	gain: null,
	unpriced: 0,
	holdings: [],
});

const accounts = [
	account('Assets', null, '300000'),
	account('Assets:Bank', 'Assets', '100000'),
	account('Assets:Gold', 'Assets', '200000'),
	account('Liabilities', null, '-90000'),
	account('Liabilities:Home loan', 'Liabilities', '-90000'),
];

const worth = [
	{
		day: '2024-11-03',
		assets: '200000',
		liabilities: '-100000',
		worth: '100000',
		parts: [],
		unpriced: 0,
	},
	{
		day: '2026-11-03',
		assets: '300000',
		liabilities: '-90000',
		worth: '210000',
		parts: [],
		unpriced: 0,
	},
];

const spend = (day: string, amounts: Record<string, string>, top = 'Expenses') => ({
	from: Temporal.PlainDate.from(day),
	to: Temporal.PlainDate.from(day),
	bucket: 'month',
	buckets: [Temporal.PlainDate.from(day)],
	deltas: [],
	totals: Object.entries(amounts).map(([a, value]) => ({
		account: a,
		parent: a === top ? null : top,
		amount: amount(value),
		unpriced: 0,
	})),
});

const ledgers = [
	{ handle: 'a', name: 'Personal', owned: true },
	{ handle: 'b', name: 'Shared', owned: false },
];

const bridge = {
	from: '2024-11-03',
	to: '2026-11-03',
	start: '100000',
	income: '50000',
	expenses: '30000',
	shifts: [{ account: 'Assets:Gold', amount: '90000' }],
	other: '0',
	end: '210000',
};

beforeEach(() => {
	vi.mocked(findBridge).mockReturnValue(answer([bridge]));
	vi.mocked(listWorth).mockReturnValue(answer(worth));
	vi.mocked(listHoldings).mockReturnValue(answer(accounts));
	vi.mocked(listDeltas).mockImplementation(({ account }) =>
		answer(
			account === 'Income'
				? [
						spend('2026-10-01', { Income: '-1000', 'Income:Salary': '-1000' }, 'Income'),
						spend('2026-09-01', { Income: '-900', 'Income:Salary': '-900' }, 'Income'),
					]
				: [
						spend('2026-10-01', {
							Expenses: '300',
							'Expenses:Rent': '200',
							'Expenses:Food': '100',
						}),
						spend('2026-09-01', { Expenses: '250', 'Expenses:Rent': '200', 'Expenses:Food': '50' }),
					],
		),
	);
});

describe('the home page', () => {
	it('shows what you own and owe, and last month against the one before', async () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		expect(await screen.findByText('Balance sheet')).toBeTruthy();
		const strip = within(screen.getByRole('region', { name: 'Figures' }));
		expect(strip.getByText('3,00,000')).toBeTruthy();
		expect(strip.getByText('in 2 groups')).toBeTruthy();
		expect(strip.getByText('30% of assets')).toBeTruthy();

		const sheet = within(screen.getByText('Balance sheet').closest('section')!);
		expect(sheet.getByText('Gold')).toBeTruthy();
		expect(sheet.getByText('Home loan')).toBeTruthy();
		expect(sheet.getByText('Net worth').closest('tr')?.textContent).toContain('2,10,000');

		const income = within(screen.getByText('Income statement').closest('section')!);
		expect(income.getByText('Rent').closest('tr')?.textContent).toContain('200');
		expect(income.getByText('Food').closest('tr')?.textContent).toContain('+50');
		expect(income.getByText('Spent').closest('tr')?.textContent).toContain('+50');
		expect(income.getByText('Salary').closest('tr')?.textContent).toContain('1,000');
		expect(income.getByText('Saved').closest('tr')?.textContent).toContain('700');
		expect(strip.getByText('70% of income')).toBeTruthy();
	});

	it('reads the last two years of net worth, and last month of spending', async () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });
		await screen.findByText('Balance sheet');

		expect(vi.mocked(listWorth)).toHaveBeenCalledWith(
			expect.objectContaining({ handle: 'a', period: expect.objectContaining({ kind: 'custom' }) }),
		);
		expect(vi.mocked(listDeltas)).toHaveBeenCalledWith(
			expect.objectContaining({
				period: { kind: 'month', at: expect.stringMatching(/^\d{4}-\d{2}$/) },
			}),
		);
	});

	it('narrows the balance sheet to the side the Accounts filter picks', async () => {
		visit('/?account=Liabilities');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });
		await screen.findByText('Balance sheet');

		const sheet = within(screen.getByText('Balance sheet').closest('section')!);
		expect(sheet.queryByText('Gold')).toBeNull();
		expect(sheet.getByText('Home loan')).toBeTruthy();
	});

	it('marks the blocks it has no data for as coming soon', async () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });
		await screen.findByText('Balance sheet');

		expect(screen.getByText('Coming soon')).toBeTruthy();
		expect(screen.getAllByText(/^Coming soon · /)).toHaveLength(1);
		expect(screen.getByText('Cash cushion')).toBeTruthy();
	});

	it('draws what moved net worth, and says so when nothing was held', async () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		const plot = await screen.findByRole('img', { name: /^Net worth from 1,00,000 to 2,10,000/ });
		expect(plot.querySelectorAll('rect')).toHaveLength(5);
		expect(screen.getByText(/^3 Nov 2024 to 3 Nov 2026 · from 1,00,000 to 2,10,000/)).toBeTruthy();

		vi.mocked(findBridge).mockReturnValue(answer([]));
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		expect(await screen.findByText('Nothing held in this period.')).toBeTruthy();
	});

	it('says the bridge covers all accounts when the Accounts filter is on', async () => {
		visit('/?account=Assets:Bank');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		expect(await screen.findByText(/from 1,00,000 to 2,10,000 · all accounts$/)).toBeTruthy();
	});

	it('shows the first ledger, and the one asked for when there are several', async () => {
		visit('/?ledger=b');
		render(Page, { data: { ...data, ledgers } });
		await screen.findByText('Balance sheet');

		expect(vi.mocked(listHoldings)).toHaveBeenCalledWith(expect.objectContaining({ handle: 'b' }));
		const picker = within(screen.getByRole('navigation', { name: 'Ledger' }));
		expect(picker.getByRole('link', { name: 'Shared' }).getAttribute('aria-current')).toBe('page');
		expect(picker.getByRole('link', { name: 'Personal' }).getAttribute('href')).toBe('?ledger=a');
	});

	it('starts every figure at zero on a ledger with nothing in it yet', async () => {
		vi.mocked(listWorth).mockReturnValue(answer([]));
		vi.mocked(listHoldings).mockReturnValue(answer([]));
		vi.mocked(listDeltas).mockReturnValue(answer([]));
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });
		await screen.findByText('Balance sheet');

		const strip = within(screen.getByRole('region', { name: 'Figures' }));
		expect(strip.getByText('in 0 groups')).toBeTruthy();
		expect(strip.getByText('0% of assets')).toBeTruthy();
		expect(strip.getByText('0% of income')).toBeTruthy();
		const sheet = within(screen.getByText('Balance sheet').closest('section')!);
		expect(sheet.getByText('Net worth').closest('tr')?.textContent).toContain('0');
	});

	it('names a lone group of assets in the singular', async () => {
		vi.mocked(listHoldings).mockReturnValue(answer(accounts.slice(0, 2)));
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });
		await screen.findByText('Balance sheet');

		expect(screen.getByText('in 1 group')).toBeTruthy();
	});

	it('says so when there is no ledger', () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [] } });

		expect(screen.getByText('You have no ledgers yet.')).toBeTruthy();
	});
});
