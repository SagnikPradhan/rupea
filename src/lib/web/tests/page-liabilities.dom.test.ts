import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listAccounts, listDeltas } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import { openFilter } from '#tests/shared/filter.ts';
import Page from '#routes/(signed-in)/l/[handle]/liabilities/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(),
	listDeltas: vi.fn(),
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

const open = (path: string, shown: unknown = [moved]) => {
	visit(path);
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

	it('draws a circle for each payment on the account that holds the debt, not on its groups', async () => {
		open('/l/h/liabilities');

		const plot = await screen.findByRole('img', { name: /^What was paid down/ });
		expect(plot.querySelectorAll('.track')).toHaveLength(2);
		expect(plot.querySelectorAll('.circle')).toHaveLength(3);
	});

	it('says so when nothing was paid down', async () => {
		open('/l/h/liabilities', [{ ...moved, deltas: [], totals: [] }]);

		expect(await screen.findByText('Nothing paid down in this period.')).toBeTruthy();
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
});
