import { render, screen, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findBridge, listHoldings, listDeltas, listTerms } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/+page.svelte';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	findBridge: vi.fn(),
	listHoldings: vi.fn(),
	listDeltas: vi.fn(),
	listTerms: vi.fn(),
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
	vi.mocked(listTerms).mockReturnValue(answer([]));
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
	it('leads with how net worth moved last month, and what moved it', async () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		const plot = await screen.findByRole('img', { name: /^Net worth from 1,00,000 to 2,10,000/ });
		expect(plot.querySelectorAll('rect')).toHaveLength(5);
		expect(screen.getByText(/^Net worth in /)).toBeTruthy();
		expect(screen.getByText(/from 1,00,000 to 2,10,000/)).toBeTruthy();
		expect(vi.mocked(findBridge)).toHaveBeenCalledWith(
			expect.objectContaining({
				period: expect.objectContaining({ kind: 'custom', from: expect.stringMatching(/-\d{2}$/) }),
			}),
		);
	});

	it('says so when nothing was held last month', async () => {
		vi.mocked(findBridge).mockReturnValue(answer([]));
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		expect(await screen.findByText('Nothing held last month.')).toBeTruthy();
	});

	it('shows net worth, what was saved and spent, and what falls due, each linking to its page', async () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		const strip = within(await screen.findByRole('region', { name: 'Last month' }));
		expect(strip.getByText('2,10,000')).toBeTruthy();
		expect(strip.getByText('700')).toBeTruthy();
		expect(strip.getByText('70% of income')).toBeTruthy();
		expect(strip.getByText('+20% on', { exact: false })).toBeTruthy();
		expect(strip.getByRole('link', { name: 'Net worth' }).getAttribute('href')).toBe(
			'/l/a/net-worth',
		);
		expect(strip.getByRole('link', { name: /^Saved in/ }).getAttribute('href')).toBe(
			'/l/a/spending',
		);
	});

	it('adds up the payments falling due in the next week', async () => {
		vi.mocked(listTerms).mockReturnValue(
			answer([{ account: 'Liabilities:Home loan', current: {}, held: { kind: 'card', due: 1 } }]),
		);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-28T12:00:00Z'));
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		const strip = within(await screen.findByRole('region', { name: 'Last month' }));
		expect(strip.getByText('90,000')).toBeTruthy();
		expect(strip.getByText('1 payment')).toBeTruthy();
		vi.useRealTimers();
	});

	it('starts every figure at zero on a ledger with nothing in it yet', async () => {
		vi.mocked(findBridge).mockReturnValue(answer([]));
		vi.mocked(listHoldings).mockReturnValue(answer([]));
		vi.mocked(listDeltas).mockReturnValue(answer([]));
		visit('/');
		render(Page, { data: { ...data, ledgers: [ledgers[0]!] } });

		const strip = within(await screen.findByRole('region', { name: 'Last month' }));
		expect(strip.getByText('0% of income')).toBeTruthy();
		expect(strip.getByText('0 payments')).toBeTruthy();
	});

	it('shows the first ledger, and the one asked for when there are several', async () => {
		visit('/?ledger=b');
		render(Page, { data: { ...data, ledgers } });
		await screen.findByRole('region', { name: 'Last month' });

		expect(vi.mocked(listHoldings)).toHaveBeenCalledWith(expect.objectContaining({ handle: 'b' }));
	});

	it('says so when there is no ledger', () => {
		visit('/');
		render(Page, { data: { ...data, ledgers: [] } });

		expect(screen.getByText('You have no ledgers yet.')).toBeTruthy();
	});
});
