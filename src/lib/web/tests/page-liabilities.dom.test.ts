import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccounts, listDeltas, listTerms, saveTerms } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import { openFilter } from '#tests/shared/filter.ts';
import Page from '#routes/(signed-in)/l/[handle]/liabilities/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(),
	listDeltas: vi.fn(),
	listTerms: vi.fn(),
	saveTerms: Object.assign(vi.fn(), { pending: 0 }),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
}));

const held = (account: string, parent: string | null, total: string) => ({
	account,
	parent,
	total,
	cost: null,
	gain: null,
	unpriced: 0,
	holdings: [],
});

const accounts = [
	held('Liabilities', null, '-325000'),
	held('Liabilities:Loans', 'Liabilities', '-300000'),
	held('Liabilities:Loans:Home', 'Liabilities:Loans', '-250000'),
	held('Liabilities:Loans:Car', 'Liabilities:Loans', '-50000'),
	held('Liabilities:Card', 'Liabilities', '-25000'),
	held('Liabilities:Old', 'Liabilities', '0'),
	held('Assets', null, '90000'),
];

const total = (account: string, amount: string) => ({
	account,
	parent: null,
	amount,
	unpriced: 0,
});

const paid = (account: string, bucket: string, amount: string) => ({
	account,
	bucket,
	amount,
	unpriced: 0,
});

const moved = {
	from: '2026-01-01',
	to: '2026-12-31',
	bucket: 'month',
	buckets: ['2026-01-01', '2026-02-01', '2026-03-01'],
	totals: [
		total('Liabilities', '40000'),
		total('Liabilities:Loans', '40000'),
		total('Liabilities:Loans:Home', '30000'),
		total('Liabilities:Loans:Car', '10000'),
	],
	deltas: [
		paid('Liabilities:Loans', '2026-01-01', '20000'),
		paid('Liabilities:Loans:Home', '2026-01-01', '15000'),
		paid('Liabilities:Loans:Home', '2026-02-01', '15000'),
		paid('Liabilities:Loans:Car', '2026-01-01', '5000'),
	],
};

const terms = [
	{
		account: 'Liabilities:Loans:Home',
		current: { kind: 'loan', rate: '8.5', payment: '42,000', due: '5', note: 'keep' },
		held: { kind: 'loan', rate: 8.5, payment: '42,000', due: 5, method: 'reducing' },
	},
];

const open = (path: string, shown: unknown = [moved], written: unknown = terms) => {
	visit(path);
	vi.mocked(listTerms).mockReturnValue(answer(written as never));
	vi.mocked(listAccounts).mockReturnValue(answer(accounts));
	vi.mocked(listDeltas).mockReturnValue(answer(shown as never));
	render(Page, { data });
};

describe('the liabilities page', () => {
	it('titles the page and says what it answers', async () => {
		open('/l/h/liabilities');

		expect((await screen.findByRole('heading', { level: 1 })).textContent).toContain('Liabilities');
		expect(screen.getByText('What you owe, what is due, and when it ends')).toBeTruthy();
	});

	it('lists what is owed on each account, leaving out the root, assets and settled accounts', async () => {
		open('/l/h/liabilities');

		expect(await screen.findByTitle('Liabilities:Loans:Home')).toBeTruthy();
		expect(screen.getByTitle('Liabilities:Loans')).toBeTruthy();
		expect(screen.getByTitle('Liabilities:Card')).toBeTruthy();
		expect(screen.queryByTitle('Liabilities')).toBeNull();
		expect(screen.queryByTitle('Liabilities:Old')).toBeNull();
		expect(screen.queryByTitle('Assets')).toBeNull();
		expect(screen.getByText(/3,25,000 owed/)).toBeTruthy();
	});

	it('brings back settled accounts when the filter asks for them', async () => {
		open('/l/h/liabilities?settled=yes');
		await openFilter();

		expect(await screen.findByTitle('Liabilities:Old')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Including settled' }).classList).toContain('on');
	});

	it('reads the liabilities over the period picked from the address', async () => {
		open('/l/h/liabilities?at=2026-09');

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(vi.mocked(listDeltas)).toHaveBeenCalledWith(
			expect.objectContaining({ account: 'Liabilities', period: { kind: 'month', at: '2026-09' } }),
		);
		expect(vi.mocked(listAccounts)).toHaveBeenCalledWith(
			expect.objectContaining({ period: { kind: 'month', at: '2026-09' } }),
		);
	});

	it('narrows to the account picked', async () => {
		open('/l/h/liabilities?account=Liabilities:Loans');

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(screen.queryByTitle('Liabilities:Card')).toBeNull();
		expect(screen.getByText(/3,00,000 owed/)).toBeTruthy();
	});

	it('stands a pin on the next 30 days for each account with a due day and an amount', async () => {
		open('/l/h/liabilities');

		const pins = await screen.findByRole('list', { name: /^The payments due in the next 30 days/ });
		expect(pins.querySelectorAll('li')).toHaveLength(1);
		expect(within(pins).getByText('42,000')).toBeTruthy();
		expect(screen.getByText(/1 payment · 42,000 in all/)).toBeTruthy();
	});

	it('says so when nothing is due in the next 30 days', async () => {
		open('/l/h/liabilities', [moved], []);

		expect(await screen.findByText('Nothing due in the next 30 days.')).toBeTruthy();
	});

	it('divides what is owed into rings, and says so when an account is in credit', async () => {
		open('/l/h/liabilities');
		expect(await screen.findByRole('img', { name: /^How what is owed divides/ })).toBeTruthy();

		vi.mocked(listAccounts).mockReturnValue(
			answer([...accounts, held('Liabilities:Refund', 'Liabilities', '300')]),
		);
		render(Page, { data });

		expect(await screen.findByText('1 account is in credit, so not drawn')).toBeTruthy();
	});

	it('marks what needs loan terms as coming soon', async () => {
		open('/l/h/liabilities');

		await screen.findByTitle('Liabilities:Loans:Home');
		expect(screen.getAllByText('Coming soon').length).toBeGreaterThanOrEqual(4);
		expect(screen.getByText('Debt-free by')).toBeTruthy();
	});

	it('shows the rate, monthly payment and due day an A line sets, and offers to set up the rest', async () => {
		open('/l/h/liabilities');

		const home = (await screen.findByTitle('Liabilities:Loans:Home')).closest('tr')!;
		expect(within(home).getByText('8.5%')).toBeTruthy();
		expect(within(home).getByText('42,000')).toBeTruthy();
		expect(within(home).getByText('5')).toBeTruthy();
		expect(within(home).getByRole('link', { name: 'Edit' })).toBeTruthy();

		const card = screen.getByTitle('Liabilities:Card').closest('tr')!;
		expect(within(card).getByRole('link', { name: 'Set up' })).toBeTruthy();
	});

	it('opens the terms of the account asked for beside the table, with what it has now', async () => {
		open('/l/h/liabilities?setup=Liabilities:Loans:Home');

		const aside = await screen.findByRole('complementary', { name: 'Set up Home' });
		expect((within(aside).getByLabelText(/Interest rate/) as HTMLInputElement).value).toBe('8.5');
		expect((within(aside).getByLabelText(/Monthly payment/) as HTMLInputElement).value).toBe(
			'42,000',
		);
	});

	it('ignores a setup request for an account that is not a liability', async () => {
		open('/l/h/liabilities?setup=Assets:Bank');

		expect(await screen.findByText('Card balance')).toBeTruthy();
		expect(screen.queryByRole('complementary')).toBeNull();
	});

	it('writes the terms as asked, keeping the keys it does not know', async () => {
		open('/l/h/liabilities?setup=Liabilities:Loans:Home');
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
		open('/l/h/liabilities?setup=Liabilities:Card');
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
