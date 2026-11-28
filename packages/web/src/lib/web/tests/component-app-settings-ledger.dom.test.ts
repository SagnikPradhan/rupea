import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { listAccounts, listBudgets, listTerms, saveTerms } from '#lib/endpoints/accounts.remote.ts';
import { goto } from '#tests/shared/app-navigation.ts';
import { visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import SettingsLedger from '#lib/web/components/app-settings-ledger/app-settings-ledger.svelte';
import { type Amount, parseAmount } from '@rupea/shared/money.ts';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(),
	listTerms: vi.fn(),
	listBudgets: vi.fn(),
	saveTerms: Object.assign(vi.fn(), { pending: 0 }),
	saveBudget: Object.assign(vi.fn(), { pending: 0 }),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	listCurrencies: vi.fn(() => answer(['INR', 'USD'])),
	saveBase: vi.fn(),
}));

const amount = (t: string) => parseAmount(t) as Amount;
const account = (a: string, parent: string | null) => ({ account: a, parent, posted: true });

const accounts = [
	account('Expenses', null),
	account('Expenses:Food', 'Expenses'),
	account('Expenses:Rent', 'Expenses'),
	account('Liabilities', null),
	account('Liabilities:Card', 'Liabilities'),
	account('Liabilities:Home', 'Liabilities'),
	account('Liabilities:Friend', 'Liabilities'),
];

const terms = [
	{
		account: 'Liabilities:Card',
		current: { kind: 'card', limit: '200000', due: '5' },
		held: { kind: 'card', limit: '200000', due: 5 },
	},
	{
		account: 'Liabilities:Home',
		current: { kind: 'loan', rate: '8.5', note: 'keep' },
		held: { kind: 'loan', rate: 8.5, method: 'reducing' },
	},
];

const food = {
	account: 'Expenses:Food',
	length: 'month',
	from: Temporal.PlainDate.from('2026-11-01'),
	to: Temporal.PlainDate.from('2026-11-30'),
	limit: amount('10000'),
	spent: amount('0'),
	left: amount('10000'),
	current: { limit: '10000' },
};

const ledger = { handle: 'h', name: 'Personal', base: 'INR' };

const open = (path: string, base = 'INR') => {
	visit(path);
	vi.mocked(listAccounts).mockReturnValue(answer(accounts));
	vi.mocked(listTerms).mockReturnValue(answer(terms));
	vi.mocked(listBudgets).mockReturnValue(answer([food]));
	render(SettingsLedger, { ledger: { ...ledger, base } });
};

describe('the accounts of a ledger in settings', () => {
	it('lists cards, loans and the rest in tables of their own', async () => {
		open('/settings');

		const cards = await screen.findByRole('table', { name: 'Cards in Personal' });
		expect(within(cards).getByTitle('Liabilities:Card')).toBeTruthy();
		expect(within(cards).getByText('2,00,000')).toBeTruthy();
		const loans = screen.getByRole('table', { name: 'Loans in Personal' });
		expect(within(loans).getByText('8.5%')).toBeTruthy();
		const unset = screen.getByRole('table', { name: 'Not set up in Personal' });
		expect(within(unset).getByText('Liabilities:Friend')).toBeTruthy();
	});

	it('writes amounts the way the base currency does', async () => {
		open('/settings', 'USD');

		const cards = await screen.findByRole('table', { name: 'Cards in Personal' });
		expect(within(cards).getByText('200,000')).toBeTruthy();
	});

	it('links each account to its terms, naming the ledger', async () => {
		open('/settings');

		const link = await screen.findByRole('link', { name: 'Set up Liabilities:Friend' });
		expect(link.getAttribute('href')).toBe(
			'/settings?ledger=h&setup=Liabilities%3AFriend#h-accounts',
		);
	});

	it('opens the terms asked for under the tables, with what they have now', async () => {
		open('/settings?ledger=h&setup=Liabilities:Card');

		const aside = await screen.findByRole('region', { name: 'Edit Card' });
		expect((within(aside).getByLabelText(/Card limit/) as HTMLInputElement).value).toBe('200000');
	});

	it('opens nothing asked for on another ledger', async () => {
		open('/settings?ledger=other&setup=Liabilities:Card');

		await screen.findByRole('table', { name: 'Cards in Personal' });
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	});

	it('ignores a setup asked for an account that is not a liability', async () => {
		open('/settings?ledger=h&setup=Assets:Bank');

		await screen.findByRole('table', { name: 'Cards in Personal' });
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	});

	it('cancels the terms back to the accounts section', async () => {
		open('/settings?ledger=h&setup=Liabilities:Card');

		const aside = await screen.findByRole('region', { name: 'Edit Card' });
		within(aside).getByRole('button', { name: 'Cancel' }).click();
		expect(goto).toHaveBeenLastCalledWith('/settings?ledger=h#h-accounts');
	});

	it('says so when there are no cards or loans, and offers to add one', async () => {
		visit('/settings');
		vi.mocked(listAccounts).mockReturnValue(answer([]));
		vi.mocked(listTerms).mockReturnValue(answer([]));
		vi.mocked(listBudgets).mockReturnValue(answer([]));
		render(SettingsLedger, { ledger });

		expect(await screen.findByText('No cards or loans yet.')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
		expect(screen.getByRole('link', { name: 'Add a card or loan' })).toBeTruthy();
	});

	it('sets up an account with no terms under the name it has', async () => {
		open('/settings?ledger=h&setup=Liabilities:Friend');

		expect(await screen.findByRole('region', { name: 'Set up Friend' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Add a card or loan' })).toBeNull();
	});

	it('opens adding a card or loan with a name to give', async () => {
		open('/settings?ledger=h&add=terms');

		const aside = await screen.findByRole('region', { name: 'Add a card or loan' });
		expect(within(aside).getByLabelText(/Name/)).toBeTruthy();
	});
});

describe('saving terms from settings', () => {
	it('adds a liability under Liabilities, by the name given', async () => {
		open('/settings?ledger=h&add=terms');
		vi.mocked(saveTerms).mockResolvedValue({ data: { file: 'main.rupea' }, errors: [] } as never);

		const aside = await screen.findByRole('region', { name: 'Add a card or loan' });
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
		open('/settings?ledger=h&add=terms');
		vi.mocked(saveTerms).mockClear();

		const aside = await screen.findByRole('region', { name: 'Add a card or loan' });
		await fireEvent.click(within(aside).getByRole('button', { name: 'Save' }));

		expect(await within(aside).findByText('Pick an account.')).toBeTruthy();
		expect(vi.mocked(saveTerms)).not.toHaveBeenCalled();
	});

	it('writes the terms as asked, keeping the keys it does not know', async () => {
		open('/settings?ledger=h&setup=Liabilities:Home');
		vi.mocked(saveTerms).mockResolvedValue({ data: { file: 'main.rupea' }, errors: [] } as never);

		const aside = await screen.findByRole('region', { name: 'Edit Home' });
		await fireEvent.input(within(aside).getByLabelText(/Interest rate/), {
			target: { value: '9' },
		});
		await fireEvent.click(within(aside).getByRole('button', { name: 'Save' }));

		expect(await within(aside).findByText('Saved in main.rupea')).toBeTruthy();
		expect(vi.mocked(saveTerms)).toHaveBeenCalledWith({
			handle: 'h',
			form: {
				account: 'Liabilities:Home',
				entries: [
					['kind', 'loan'],
					['rate', '9'],
					['note', 'keep'],
				],
			},
		});
	});

	it('does not save a rate that is not a number', async () => {
		open('/settings?ledger=h&setup=Liabilities:Card');
		vi.mocked(saveTerms).mockClear();

		const aside = await screen.findByRole('region', { name: 'Edit Card' });
		await fireEvent.input(within(aside).getByLabelText(/Interest rate/), {
			target: { value: 'high' },
		});
		await fireEvent.click(within(aside).getByRole('button', { name: 'Save' }));

		expect(await within(aside).findByText('Check the terms against the hints.')).toBeTruthy();
		expect(vi.mocked(saveTerms)).not.toHaveBeenCalled();
	});
});

describe('the budgets of a ledger in settings', () => {
	it('lists each budget with its limit and period', async () => {
		open('/settings');

		const table = await screen.findByRole('table', { name: 'Budgets in Personal' });
		expect(within(table).getByText('Expenses:Food')).toBeTruthy();
		expect(within(table).getByText('10,000')).toBeTruthy();
		expect(within(table).getByText('Each month')).toBeTruthy();
	});

	it('opens the budget asked for', async () => {
		open('/settings?ledger=h&budget=expenses:food');

		expect(await screen.findByRole('region', { name: 'Budget for Food' })).toBeTruthy();
	});

	it('offers only the expenses with no budget when adding one', async () => {
		open('/settings?ledger=h&add=budget');

		const aside = await screen.findByRole('region', { name: 'Add budget' });
		await userEvent.click(within(aside).getByRole('combobox', { name: /Account/ }));
		const options = await screen.findAllByRole('option');
		expect(options.map((o) => o.textContent?.trim())).toEqual(['Expenses:Rent']);
	});

	it('cancels a budget back to the budgets section', async () => {
		open('/settings?ledger=h&add=budget');

		const aside = await screen.findByRole('region', { name: 'Add budget' });
		within(aside).getByRole('button', { name: 'Cancel' }).click();
		expect(goto).toHaveBeenLastCalledWith('/settings?ledger=h#h-budgets');
	});
});
