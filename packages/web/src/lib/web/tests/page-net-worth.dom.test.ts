import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import {
	listDeltas,
	listDrops,
	listHoldings,
	listInvested,
	listReturns,
	listTerms,
	listWorth,
	saveTerms,
} from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import { openFilter } from '#tests/shared/filter.ts';
import Page from '#routes/(signed-in)/l/[handle]/net-worth/+page.svelte';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

const on = (d: string) => Temporal.PlainDate.from(d);
const amount = (t: string) => parseAmount(t) as Amount;

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listHoldings: vi.fn(),
	listReturns: vi.fn(() => answer([])),
	listInvested: vi.fn(() => answer([])),
	listDrops: vi.fn(() => answer([])),
	listDeltas: vi.fn(() => answer([])),
	listTerms: vi.fn(() => answer([])),
	listWorth: vi.fn(() => answer([])),
	saveTerms: Object.assign(vi.fn(), { pending: 0 }),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
}));

const rupees = (total: string) => ({
	commodity: 'INR',
	hasLots: false,
	units: null,
	cost: null,
	price: null,
	value: total,
	gain: null,
});

const accounts = [
	{
		account: 'Assets',
		parent: null,
		total: amount('51500'),
		cost: amount('1500'),
		gain: amount('500'),
		unpriced: 1,
		holdings: [rupees('50000')],
	},
	{
		account: 'Assets:Bank',
		parent: 'Assets',
		total: amount('50000'),
		cost: null,
		gain: null,
		unpriced: 0,
		holdings: [rupees('50000')],
	},
	{
		account: 'Assets:Broker',
		parent: 'Assets',
		total: amount('2000'),
		cost: amount('1500'),
		gain: amount('500'),
		unpriced: 0,
		holdings: [
			rupees('0'),
			{
				commodity: 'INFY',
				hasLots: true,
				units: '1 INFY',
				cost: '1500',
				price: '2000',
				value: '2000',
				gain: '500',
			},
		],
	},
];

describe('what you own on the net worth page', () => {
	it('nests accounts under their groups, and links holdings with lots', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		render(Page, { data });

		expect(await screen.findByTitle('Assets:Broker')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'INFY' }).getAttribute('href')).toBe(
			'/l/h/net-worth/lots?account=Assets%3ABroker&commodity=INFY',
		);
		expect(screen.getByText('1 unpriced')).toBeTruthy();
	});

	it('reads the period picked from the address, and marks it in the filter', async () => {
		visit('/l/h/net-worth?at=2026-09');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		render(Page, { data });
		await openFilter();

		expect(await screen.findByTitle('Assets:Broker')).toBeTruthy();
		expect(vi.mocked(listHoldings)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-09' } }),
		);
		expect(screen.getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBe('page');
	});

	it('narrows the table to the account picked, offering those under it', async () => {
		visit('/l/h/net-worth?account=Assets:Broker');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		render(Page, { data });
		await openFilter();

		await screen.findByRole('navigation', { name: 'Account' });
		expect(screen.getByTitle('Assets:Broker')).toBeTruthy();
		expect(screen.queryByTitle('Assets:Bank')).toBeNull();
		expect(screen.getByRole('link', { name: 'Select all' }).getAttribute('href')).toBe(
			'/l/h/net-worth',
		);
	});

	it('draws the value against the cost, and says so when no holding has a cost', async () => {
		visit('/l/h/net-worth?account=Assets:Broker');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		render(Page, { data });

		await screen.findByRole('region', { name: 'Net worth figures' });
		expect(screen.queryByRole('img', { name: /^Value against cost from/ })).toBeNull();

		vi.mocked(listInvested).mockReturnValue(
			answer([
				{ day: '2026-01-01', value: '1500', cost: '1500' },
				{ day: '2026-02-01', value: '2000', cost: '1500' },
			]),
		);
		render(Page, { data });

		expect(await screen.findByRole('img', { name: /^Value against cost from/ })).toBeTruthy();
		expect(vi.mocked(listInvested)).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Assets:Broker' }),
		);
	});

	it('charts how far investments fell, and asks for price history when it cannot', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		render(Page, { data });

		expect(await screen.findAllByText('Needs price history.')).toHaveLength(2);

		vi.mocked(listDrops).mockReturnValue(
			answer([
				{
					underwater: [
						{ day: '2026-01-01', depth: 0 },
						{ day: '2026-02-01', depth: -0.2 },
					],
					lows: [{ account: 'Assets:Broker', depth: -0.2, day: '2026-02-01' }],
					swings: [{ account: 'Assets:Broker', swing: 0.2 }],
				},
			]),
		);
		render(Page, { data });

		expect(
			await screen.findByRole('img', { name: /^How far investments stood below/ }),
		).toBeTruthy();
		expect(screen.queryByRole('img', { name: /^Return a year against/ })).toBeNull();
	});

	it('plots return against swing for an account with both', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		vi.mocked(listReturns).mockReturnValue(
			answer([{ account: 'Assets:Broker', netIn: '1500', xirr: 0.1, yearly: true }]),
		);
		vi.mocked(listDrops).mockReturnValue(
			answer([
				{
					underwater: [{ day: '2026-01-01', depth: 0 }],
					lows: [],
					swings: [{ account: 'Assets:Broker', swing: 0.2 }],
				},
			]),
		);
		render(Page, { data });

		const plot = await screen.findByRole('img', { name: /^Return a year against/ });
		expect(plot.querySelectorAll('.dot')).toHaveLength(1);
	});

	it('divides the assets into rings, and says so when something owes', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(
			answer([
				...accounts,
				{
					account: 'Assets:Card',
					parent: 'Assets',
					total: amount('-300'),
					cost: null,
					gain: null,
					unpriced: 0,
					holdings: [rupees('-300')],
				},
			]),
		);
		render(Page, { data });

		expect(
			await screen.findByRole('img', { name: 'How Assets divides across its accounts' }),
		).toBeTruthy();
		expect(screen.getByText('1 account is below zero, so not drawn')).toBeTruthy();
	});

	it('counts every account below zero in the note', async () => {
		visit('/l/h/net-worth');
		const owing = (account: string) => ({
			account,
			parent: 'Assets',
			total: amount('-300'),
			cost: null,
			gain: null,
			unpriced: 0,
			holdings: [rupees('-300')],
		});
		vi.mocked(listHoldings).mockReturnValue(
			answer([...accounts, owing('Assets:Card'), owing('Assets:Loan')]),
		);
		render(Page, { data });

		expect(await screen.findByText('2 accounts are below zero, so not drawn')).toBeTruthy();
	});

	it('shows no note when nothing is below zero', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		render(Page, { data });

		await screen.findByRole('img', { name: 'How Assets divides across its accounts' });
		expect(screen.queryByText(/below zero/)).toBeNull();
	});

	it('says there is nothing to divide on a ledger with no accounts under Assets', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(answer([]));
		render(Page, { data });

		expect(await screen.findByText('Nothing to divide.')).toBeTruthy();
	});

	it('leads with net worth, what is owned and what is owed, and closes on a balance sheet', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listWorth).mockReturnValue(
			answer([
				{
					day: '2026-01-01',
					assets: '200000',
					liabilities: '-50000',
					worth: '150000',
					parts: [],
					unpriced: 0,
				},
				{
					day: '2026-02-01',
					assets: '300000',
					liabilities: '-75000',
					worth: '225000',
					parts: [],
					unpriced: 0,
				},
			]),
		);
		render(Page, { data });

		const strip = within(await screen.findByRole('region', { name: 'Net worth figures' }));
		expect(strip.getByText('Owned').nextElementSibling?.textContent).toBe('3,00,000');
		expect(strip.getByText('Owed').nextElementSibling?.textContent).toBe('75,000');
		expect(strip.getByText('25% of what you own')).toBeTruthy();
		expect(screen.getByRole('img', { name: /^Net worth from/ })).toBeTruthy();
		expect(screen.getByText('Balance sheet')).toBeTruthy();
	});

	it('starts every figure at zero on a ledger with nothing in it yet', async () => {
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(answer([]));
		vi.mocked(listWorth).mockReturnValue(answer([]));
		render(Page, { data });

		const strip = within(await screen.findByRole('region', { name: 'Net worth figures' }));
		expect(strip.getByText('0% on cost')).toBeTruthy();
		expect(strip.getByText('0%')).toBeTruthy();
		expect(strip.getByText('0% of what you own')).toBeTruthy();
		expect(screen.getByText(/^0 groups/)).toBeTruthy();
	});

	it('tones a loss as negative, and names a lone account and group in the singular', async () => {
		const lost = { cost: '1500', gain: '-500' };
		visit('/l/h/net-worth');
		vi.mocked(listHoldings).mockReturnValue(
			answer([
				{ ...accounts[0]!, ...lost },
				{ ...accounts[2]!, ...lost },
			]),
		);
		render(Page, { data });

		const strip = within(await screen.findByRole('region', { name: 'Net worth figures' }));
		expect(strip.getByText(/on cost$/).classList.contains('negative')).toBe(true);
		expect(screen.getByText(/^1 group ·/)).toBeTruthy();
	});

	it('shows what flowed into each Assets account and its XIRR, per year only over a year', async () => {
		visit('/l/h/net-worth?at=2026-09');
		vi.mocked(listHoldings).mockReturnValue(answer(accounts));
		vi.mocked(listReturns).mockReturnValue(
			answer(
				[
					{ account: 'Assets', netIn: '1500', xirr: null, yearly: false },
					{ account: 'Assets:Bank', netIn: '-1500', xirr: 0.035, yearly: true },
					{ account: 'Assets:Broker', netIn: '1500', xirr: -0.02, yearly: false },
				],
				[{ type: 'ReturnUnsolved', account: 'Assets' }],
			),
		);
		render(Page, { data });

		const bank = (await screen.findByTitle('Assets:Bank')).closest('tr');
		const broker = screen.getByTitle('Assets:Broker').closest('tr');
		expect(bank?.textContent).toContain('3.5%');
		expect(within(bank as HTMLElement).getByTitle('XIRR, per year').textContent).toContain('p.a.');
		expect(within(broker as HTMLElement).getByTitle('Return over the period').textContent).toBe(
			'-2%',
		);
		expect(screen.getByText(/Assets has no XIRR/)).toBeTruthy();
		expect(vi.mocked(listReturns)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-09' } }),
		);
	});
});

const held = (account: string, parent: string | null, total: string) => ({
	account,
	parent,
	total: amount(total),
	cost: null,
	gain: null,
	unpriced: 0,
	holdings: [],
});

const liabilities = [
	held('Liabilities', null, '-325000'),
	held('Liabilities:Loans', 'Liabilities', '-300000'),
	held('Liabilities:Loans:Home', 'Liabilities:Loans', '-250000'),
	held('Liabilities:Loans:Car', 'Liabilities:Loans', '-50000'),
	held('Liabilities:Card', 'Liabilities', '-25000'),
	held('Liabilities:Old', 'Liabilities', '0'),
	held('Assets', null, '90000'),
];

const total = (account: string, value: string, outflow = '0') => ({
	account,
	parent: null,
	amount: amount(value),
	inflow: amount(value),
	outflow: amount(outflow),
	unpriced: 0,
});

const paid = (account: string, bucket: Temporal.PlainDate, value: string) => ({
	account,
	bucket,
	amount: amount(value),
	inflow: amount(value),
	outflow: amount('0'),
	unpriced: 0,
});

const moved = {
	from: on('2026-01-01'),
	to: on('2026-12-31'),
	bucket: 'month',
	buckets: [on('2026-01-01'), on('2026-02-01'), on('2026-03-01')],
	totals: [
		total('Liabilities', '40000'),
		total('Liabilities:Loans', '40000'),
		total('Liabilities:Loans:Home', '30000'),
		total('Liabilities:Loans:Car', '10000'),
	],
	deltas: [
		paid('Liabilities:Loans', on('2026-01-01'), '20000'),
		paid('Liabilities:Loans:Home', on('2026-01-01'), '15000'),
		paid('Liabilities:Loans:Home', on('2026-02-01'), '15000'),
		paid('Liabilities:Loans:Car', on('2026-01-01'), '5000'),
	],
};

const terms = [
	{
		account: 'Liabilities:Loans:Home',
		current: { kind: 'loan', rate: '8.5', payment: '42,000', due: '5', note: 'keep' },
		held: { kind: 'loan', rate: 8.5, payment: '42,000', due: 5, method: 'reducing' },
	},
];

const open = (
	path: string,
	shown: unknown = [moved],
	written: unknown = terms,
	owing = liabilities,
) => {
	visit(path);
	vi.mocked(listTerms).mockReturnValue(answer(written as never));
	vi.mocked(listHoldings).mockReturnValue(answer(owing));
	vi.mocked(listDeltas).mockReturnValue(answer(shown as never));
	render(Page, { data });
};

describe('what you owe on the net worth page', () => {
	it('titles the page and says what it answers', async () => {
		open('/l/h/net-worth');

		expect((await screen.findByRole('heading', { level: 1 })).textContent).toContain('Net worth');
		expect(screen.getByText('What you are worth, and how it has grown')).toBeTruthy();
	});

	it('lists what is owed in its own table, not with what you own', async () => {
		open('/l/h/net-worth');

		expect(await screen.findAllByTitle('Liabilities:Loans')).toHaveLength(1);
	});

	it('lists what is owed on each account, leaving out the root and assets, and keeping settled accounts', async () => {
		open('/l/h/net-worth');

		expect(await screen.findByTitle('Liabilities:Loans:Home')).toBeTruthy();
		expect(screen.getByTitle('Liabilities:Loans')).toBeTruthy();
		expect(screen.getByTitle('Liabilities:Card')).toBeTruthy();
		expect(screen.queryByTitle('Liabilities')).toBeNull();
		expect(screen.getByTitle('Liabilities:Old')).toBeTruthy();
		expect(screen.queryByTitle('Assets')).toBeNull();
		expect(screen.getByText(/3,25,000 owed/)).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Drawn' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Paid' })).toBeTruthy();
	});

	it('leaves out settled accounts when the table asks for open ones only', async () => {
		open('/l/h/net-worth?settled=no');

		expect(await screen.findByTitle('Liabilities:Loans:Home')).toBeTruthy();
		expect(screen.queryByTitle('Liabilities:Old')).toBeNull();
		expect(screen.getByRole('link', { name: 'Open only' }).classList).toContain('on');
	});

	it('reads the liabilities over the period picked from the address', async () => {
		open('/l/h/net-worth?at=2026-09');

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(vi.mocked(listDeltas)).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Liabilities', period: { kind: 'month', at: '2026-09' } }),
		);
		expect(vi.mocked(listHoldings)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-09' } }),
		);
	});

	it('narrows to the account picked', async () => {
		open('/l/h/net-worth?account=Liabilities:Loans');

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(screen.queryByTitle('Liabilities:Card')).toBeNull();
		expect(screen.getByText(/3,00,000 owed/)).toBeTruthy();
	});

	it('stands a pin for each payment made and each one still due, a line to each account', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-08') });
		open('/l/h/net-worth');

		const chart = await screen.findByRole('list', { name: /^The payments made and due/ });
		const pins = within(chart).getAllByRole('listitem');
		expect(pins.filter((p) => p.classList.contains('past'))).toHaveLength(3);
		expect(pins).toHaveLength(4);
		expect(screen.getByText(/3 payments made · 1 still to fall due/)).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Owed' })).toBeTruthy();
		vi.useRealTimers();
	});

	it('draws the payments of the account picked only', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-08') });
		open('/l/h/net-worth?account=Liabilities:Loans:Car');

		const chart = await screen.findByRole('list', { name: /^The payments made and due/ });
		expect(within(chart).getAllByRole('listitem')).toHaveLength(1);
		expect(screen.getByText(/1 payment made · 0 still to fall due/)).toBeTruthy();
		vi.useRealTimers();
	});

	it('says so when no payment was made or is due in the period', async () => {
		open('/l/h/net-worth', [{ ...moved, deltas: [], totals: [] }], []);

		expect(await screen.findByText('No payments in this period.')).toBeTruthy();
	});

	it('divides what is owed into rings, and says so when an account is in credit', async () => {
		open('/l/h/net-worth');
		expect(await screen.findByRole('img', { name: /^How what is owed divides/ })).toBeTruthy();

		vi.mocked(listHoldings).mockReturnValue(
			answer([...liabilities, held('Liabilities:Refund', 'Liabilities', '300')]),
		);
		render(Page, { data });

		expect(await screen.findByText('1 account is in credit, so not drawn')).toBeTruthy();
	});

	it('estimates the interest a month and when the loans end when every debt is a loan or a card', async () => {
		const card = {
			account: 'Liabilities:Card',
			current: { kind: 'card' },
			held: { kind: 'card', limit: '90,000' },
		};
		open(
			'/l/h/net-worth',
			[moved],
			[...terms, card],
			liabilities.filter((a) => a.account !== 'Liabilities:Loans:Car'),
		);

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(screen.getByText('about 1,771')).toBeTruthy();
		expect(screen.getByText('Loan interest a month')).toBeTruthy();
		expect(screen.getByText('Loans paid off by').nextElementSibling?.textContent).not.toBe('–');
		expect(screen.queryByText(/^Coming soon/)).toBeNull();
		expect(screen.getByText('Due in 30 days').nextElementSibling?.textContent).not.toBe('0');
	});

	it('shows a dash for the estimates while a debt has no terms', async () => {
		open('/l/h/net-worth');

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(screen.getByText('Loan interest a month').nextElementSibling?.textContent).toBe('–');
		expect(screen.getByText('Loans paid off by').nextElementSibling?.textContent).toBe('–');
	});

	it('follows the account picked for the estimates', async () => {
		open('/l/h/net-worth?account=Liabilities:Loans:Home');

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(screen.getByText('about 1,771')).toBeTruthy();
	});

	it('shows a dash for the estimates when no loan has terms', async () => {
		open('/l/h/net-worth', [moved], []);

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(screen.getByText('Loans paid off by').nextElementSibling?.textContent).toBe('–');
	});

	it('shows the rate, monthly payment and due day an A line sets, and offers to set up the rest', async () => {
		open('/l/h/net-worth');

		const home = (await screen.findByTitle('Liabilities:Loans:Home')).closest('tr')!;
		expect(within(home).getByText('8.5%')).toBeTruthy();
		expect(within(home).getByText('42,000')).toBeTruthy();
		expect(within(home).getByText('5')).toBeTruthy();
		expect(within(home).getByRole('link', { name: 'Edit' })).toBeTruthy();

		const card = screen.getByTitle('Liabilities:Card').closest('tr')!;
		expect(within(card).getByRole('link', { name: 'Set up' })).toBeTruthy();

		const loans = screen.getByTitle('Liabilities:Loans').closest('tr')!;
		expect(within(loans).queryByRole('link', { name: /^(Set up|Edit)$/ })).toBeNull();
	});

	it('opens the terms of the account asked for beside the table, with what it has now', async () => {
		open('/l/h/net-worth?setup=Liabilities:Loans:Home');

		const aside = await screen.findByRole('complementary', { name: 'Set up Home' });
		expect((within(aside).getByLabelText(/Interest rate/) as HTMLInputElement).value).toBe('8.5');
		expect((within(aside).getByLabelText(/Monthly payment/) as HTMLInputElement).value).toBe(
			'42,000',
		);
	});

	it('ignores a setup request for an account that is not a liability', async () => {
		open('/l/h/net-worth?setup=Assets:Bank');

		expect(await screen.findByText('What you owe')).toBeTruthy();
		expect(screen.queryByRole('complementary', { name: /^Set up/ })).toBeNull();
	});

	it('always offers to add a liability beside the table, saving under Liabilities', async () => {
		open('/l/h/net-worth');
		vi.mocked(saveTerms).mockResolvedValue({ data: { file: 'main.rupea' }, errors: [] } as never);

		const aside = await screen.findByRole('complementary', { name: 'Add a liability' });
		await fireEvent.input(within(aside).getByLabelText(/Name/), {
			target: { value: 'Loans:Bike' },
		});
		await fireEvent.input(within(aside).getByLabelText(/Interest rate/), {
			target: { value: '9' },
		});
		await fireEvent.click(within(aside).getByRole('button', { name: 'Save' }));

		expect(await within(aside).findByText('Saved in main.rupea')).toBeTruthy();
		expect(vi.mocked(saveTerms)).toHaveBeenCalledWith(
			expect.objectContaining({
				form: expect.objectContaining({ account: 'Liabilities:Loans:Bike' }),
			}),
		);
	});

	it('asks for a name before adding a liability', async () => {
		open('/l/h/net-worth');
		vi.mocked(saveTerms).mockClear();

		const aside = await screen.findByRole('complementary', { name: 'Add a liability' });
		await fireEvent.click(within(aside).getByRole('button', { name: 'Save' }));

		expect(await within(aside).findByText('Pick an account.')).toBeTruthy();
		expect(vi.mocked(saveTerms)).not.toHaveBeenCalled();
	});

	it('writes the terms as asked, keeping the keys it does not know', async () => {
		open('/l/h/net-worth?setup=Liabilities:Loans:Home');
		vi.mocked(saveTerms).mockResolvedValue({ data: { file: 'main.rupea' }, errors: [] } as never);

		const aside = await screen.findByRole('complementary', { name: 'Set up Home' });
		await fireEvent.input(within(aside).getByLabelText(/Interest rate/), {
			target: { value: '9' },
		});
		await fireEvent.click(within(aside).getByRole('button', { name: 'Save' }));

		expect(await within(aside).findByText('Saved in main.rupea')).toBeTruthy();
		expect(vi.mocked(saveTerms)).toHaveBeenCalledWith({
			handle: 'h',
			form: {
				account: 'Liabilities:Loans:Home',
				entries: [
					['kind', 'loan'],
					['rate', '9'],
					['payment', '42,000'],
					['due', '5'],
					['note', 'keep'],
				],
			},
		});
	});

	it('does not save a rate that is not a number', async () => {
		open('/l/h/net-worth?setup=Liabilities:Card');
		vi.mocked(saveTerms).mockClear();

		const aside = await screen.findByRole('complementary', { name: 'Set up Card' });
		await fireEvent.input(within(aside).getByLabelText(/Interest rate/), {
			target: { value: 'high' },
		});
		await fireEvent.click(within(aside).getByRole('button', { name: 'Save' }));

		expect(await within(aside).findByText('Check the terms against the hints.')).toBeTruthy();
		expect(vi.mocked(saveTerms)).not.toHaveBeenCalled();
	});
});
