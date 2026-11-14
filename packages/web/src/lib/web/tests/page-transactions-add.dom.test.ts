import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createTransaction,
	deleteTransaction,
	findTransaction,
	findTransactionFiles,
	saveTransaction,
} from '#lib/endpoints/files.remote.ts';
import { goto } from '$app/navigation';
import { fault } from '@rupea/shared/errors.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/transactions/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccounts: vi.fn(() =>
		answer([
			{ account: 'Assets', parent: null, posted: false },
			{ account: 'Assets:Bank', parent: 'Assets', posted: true },
			{ account: 'Assets:Cash', parent: 'Assets', posted: true },
			{ account: 'Expenses', parent: null, posted: false },
			{ account: 'Expenses:Food', parent: 'Expenses', posted: true },
			{ account: 'Liabilities:Card', parent: null, posted: true },
		]),
	),
}));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findFirstDay: vi.fn(() => answer('2025-03-14')),
	listProblems: vi.fn(() => answer([])),
}));
vi.mock('#lib/endpoints/transactions.remote.ts', () => ({
	listTransactions: vi.fn(() =>
		Object.assign(answer({ rows: [], next: null }), { refresh: vi.fn() }),
	),
}));
vi.mock('#lib/endpoints/files.remote.ts', () => ({
	findTransactionFiles: vi.fn(),
	findTransaction: vi.fn(),
	createTransaction: Object.assign(vi.fn(), { pending: 0 }),
	saveTransaction: Object.assign(vi.fn(), { pending: 0 }),
	deleteTransaction: Object.assign(vi.fn(), { pending: 0 }),
}));

const opened = async () => {
	visit('/l/h/transactions?add=1');
	render(Page, { data });
	return screen.findByLabelText(/^Description/);
};

const detail = () => fireEvent.click(screen.getByRole('button', { name: 'Detail' }));

const fileBox = async () => {
	await opened();
	await detail();
	return (await screen.findByLabelText(/^File/)) as HTMLInputElement;
};

const type = (label: string, value: string, index = 0) =>
	fireEvent.input(screen.getAllByLabelText(new RegExp('^' + label))[index]!, { target: { value } });

const fill = async () => {
	await type('Description', 'Groceries');
	await type('Amount', '100');
	await type('Category', 'Food');
	await type('Paid from', 'Assets:Bank');
};

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('the add transaction panel', () => {
	beforeEach(() => {
		vi.mocked(createTransaction).mockReset();
		vi.mocked(goto).mockClear();
		vi.mocked(findTransactionFiles).mockReturnValue(
			answer({ keys: ['a.rupea', 'b.rupea'], newest: 'b.rupea' }),
		);
	});

	it('picks the file with the latest transaction, and starts a file in an empty ledger', async () => {
		expect((await fileBox()).value).toBe('b.rupea');

		document.body.innerHTML = '';
		vi.mocked(findTransactionFiles).mockReturnValue(answer({ keys: [], newest: null }));
		expect((await fileBox()).value).toBe('transactions.rupea');
	});

	it('shows what is wrong beside its box, without asking the server', async () => {
		await opened();
		await save();

		expect((await screen.findByText('Write a description.')).closest('div')?.textContent).toContain(
			'Description',
		);
		expect(createTransaction).not.toHaveBeenCalled();
	});

	it('saves, links to the line it wrote, and clears for the next one', async () => {
		vi.mocked(createTransaction).mockResolvedValue({
			ok: true,
			data: { file: 'b.rupea', line: 7 },
			errors: [],
		} as never);
		await opened();
		await fill();
		await save();

		const link = (await screen.findByRole('link', { name: 'b.rupea:7' })) as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/l/h/files?file=b.rupea&line=7');
		expect(vi.mocked(createTransaction).mock.calls[0]?.[0]).toMatchObject({
			handle: 'h',
			form: {
				file: 'b.rupea',
				description: 'Groceries',
				postings: [{ account: 'Expenses:Food', amount: '100' }, { account: 'Assets:Bank' }],
			},
		});
		expect((screen.getByLabelText(/^Description/) as HTMLInputElement).value).toBe('');
	});

	it('opens simple, with the day and the amount and nothing for the ledger to parse', async () => {
		await opened();

		expect(screen.getByLabelText(/^Date/)).toBeTruthy();
		expect(screen.getByText('The day it happened.')).toBeTruthy();
		expect(screen.getByLabelText(/^Amount/)).toBeTruthy();
		for (const hidden of [/^Time/, /^Comment/, /^File/, /^Currency/])
			expect(screen.queryByLabelText(hidden)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Add detail' })).toBeNull();
	});

	it('puts the cursor in the amount of a new entry, and leaves an edit alone', async () => {
		await opened();
		expect(document.activeElement).toBe(screen.getByLabelText(/^Amount/));
	});

	it('shows time, comment, file and details in the detail view', async () => {
		await opened();
		await detail();

		for (const shown of [/^Time/, /^Comment/, /^File/])
			expect(await screen.findByLabelText(shown)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Add detail' })).toBeTruthy();
	});

	it('names the entry after its category when the description is left empty', async () => {
		vi.mocked(createTransaction).mockResolvedValue({
			ok: true,
			data: { file: 'b.rupea', line: 7 },
			errors: [],
		} as never);
		await opened();
		await type('Amount', '100');
		await type('Category', 'Food');
		await type('Paid from', 'Assets:Bank');
		await save();

		await screen.findByRole('status');
		expect(vi.mocked(createTransaction).mock.calls[0]?.[0]).toMatchObject({
			form: { description: 'Food' },
		});
	});

	it('closes from the title bar or with Escape, keeping the filter', async () => {
		visit('/l/h/transactions?add=1&at=2026-08');
		render(Page, { data });
		await screen.findByRole('complementary', { name: 'Add transaction' });

		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(goto).toHaveBeenCalledTimes(2);
		expect(goto).toHaveBeenCalledWith('?at=2026-08');
		expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull();
	});

	it('adds a detail as a key and a value, and takes it out with its icon button', async () => {
		await opened();
		await detail();
		await fireEvent.click(screen.getByRole('button', { name: 'Add detail' }));

		expect(screen.getByLabelText(/^Key/)).toBeTruthy();
		expect(screen.getByLabelText(/^Value/)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Remove detail' }));

		expect(screen.queryByLabelText(/^Key/)).toBeNull();
	});

	it('is there without asking on a wide screen', async () => {
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: true,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}));
		visit('/l/h/transactions');
		render(Page, { data });

		expect(await screen.findByRole('complementary', { name: 'Add transaction' })).toBeTruthy();
		expect(screen.getByLabelText(/^Description/)).toBeTruthy();

		vi.unstubAllGlobals();
	});

	it('says why the server refused, and keeps what was typed', async () => {
		vi.mocked(createTransaction).mockResolvedValue({
			ok: false,
			data: null,
			errors: [fault('ParseUnbalancedTransaction', { location: 'a:1', residual: '10.00' })],
		} as never);
		await opened();
		await fill();
		await save();

		expect((await screen.findByRole('alert')).textContent).toContain('off by 10.00');
		expect((screen.getByLabelText(/^Description/) as HTMLInputElement).value).toBe('Groceries');
	});

	it('writes each kind as two sides, adding the account type someone new leaves off', async () => {
		vi.mocked(createTransaction).mockResolvedValue({
			ok: true,
			data: { file: 'b.rupea', line: 7 },
			errors: [],
		} as never);
		await opened();
		await fireEvent.click(screen.getByRole('button', { name: 'Income' }));
		await type('Description', 'Pay');
		await type('Amount', '500');
		await type('Paid into', 'Current account');
		await type('Source', 'Salary');
		await save();

		await screen.findByRole('status');
		expect(vi.mocked(createTransaction).mock.calls[0]?.[0]).toMatchObject({
			form: {
				postings: [
					{ account: 'Assets:Current-account', amount: '500' },
					{ account: 'Income:Salary', amount: '' },
				],
			},
		});
	});

	it('asks for an amount rather than saving two empty sides', async () => {
		await opened();
		await type('Description', 'Groceries');
		await type('Category', 'Food');
		await type('Paid from', 'Bank');
		await save();

		expect(await screen.findByText('Write an amount.')).toBeTruthy();
		expect(createTransaction).not.toHaveBeenCalled();
	});

	it('carries a simple entry into lines, which it adds and removes, always keeping two', async () => {
		await opened();
		await type('Amount', '100');
		await type('Category', 'Food');
		await detail();

		const accounts = (await screen.findAllByLabelText(/^Account/)) as HTMLInputElement[];
		expect(accounts.map((a) => a.value)).toEqual(['Expenses:Food', '']);
		expect(screen.getByRole('button', { name: 'Simple' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Remove line/ })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Add a line' }));
		expect(await screen.findAllByLabelText(/^Account/)).toHaveLength(3);

		await fireEvent.click(screen.getByRole('button', { name: 'Remove line 3' }));
		await vi.waitFor(() => expect(screen.getAllByLabelText(/^Account/)).toHaveLength(2));
	});
});

describe('the edit transaction panel', () => {
	const posting = (account: string, amount: string) => ({
		account,
		amount,
		commodity: '',
		price: '',
		total: false,
		cost: '',
		costDate: '',
		balance: '',
		comment: '',
		metadata: [],
	});
	const read = {
		file: 'a.rupea',
		line: 5,
		version: 'v1',
		form: {
			file: 'a.rupea',
			date: '2026-08-29',
			time: '',
			description: 'Groceries',
			comment: '',
			metadata: [],
			postings: [posting('Expenses:Food', '100.50'), posting('Assets:Bank', '-100.50')],
		},
	};
	const done = { ok: true, data: { file: 'a.rupea', line: 5 }, errors: [] } as never;

	const editing = async () => {
		visit('/l/h/transactions?edit=7&at=2026-08');
		render(Page, { data });
		return (await screen.findByLabelText(/^Description/)) as HTMLInputElement;
	};

	beforeEach(() => {
		vi.mocked(saveTransaction).mockReset();
		vi.mocked(deleteTransaction).mockReset();
		vi.mocked(goto).mockClear();
		vi.mocked(findTransaction).mockReturnValue(answer(read));
	});

	it('opens a two-sided transaction as the simple view shows it', async () => {
		expect((await editing()).value).toBe('Groceries');
		expect((screen.getByLabelText(/^Amount/) as HTMLInputElement).value).toBe('100.50');
		expect((screen.getByLabelText(/^Category/) as HTMLInputElement).value).toBe('Expenses:Food');
		expect((screen.getByLabelText(/^Paid from/) as HTMLInputElement).value).toBe('Assets:Bank');
		expect(screen.getByRole('button', { name: 'Expense' }).getAttribute('aria-pressed')).toBe(
			'true',
		);
		expect(screen.queryByLabelText(/^Account/)).toBeNull();
	});

	it('does not take the cursor when an existing transaction opens', async () => {
		await editing();

		expect(document.activeElement).not.toBe(screen.getByLabelText(/^Amount/));
	});

	it('shows the same transaction in lines in the detail view, without the file box', async () => {
		await editing();
		await detail();

		expect(await screen.findAllByLabelText(/^Account/)).toHaveLength(2);
		expect((screen.getAllByLabelText(/^Amount/)[0] as HTMLInputElement).value).toBe('100.50');
		expect(screen.queryByLabelText(/^File/)).toBeNull();
	});

	it('opens in detail when simple cannot show it, and will not switch until it can', async () => {
		vi.mocked(findTransaction).mockReturnValue(
			answer({
				...read,
				form: {
					...read.form,
					postings: [
						posting('Expenses:Food', '60'),
						posting('Expenses:Fuel', '40'),
						posting('Assets:Bank', '-100'),
					],
				},
			}),
		);
		await editing();

		expect(await screen.findAllByLabelText(/^Account/)).toHaveLength(3);
		expect((screen.getByRole('button', { name: 'Simple' }) as HTMLButtonElement).disabled).toBe(
			true,
		);
		expect(screen.getByText(/^Simple fits two lines/)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));
		await vi.waitFor(() => expect(screen.getAllByLabelText(/^Account/)).toHaveLength(2));
		expect((screen.getByRole('button', { name: 'Simple' }) as HTMLButtonElement).disabled).toBe(
			true,
		);

		await type('Amount', '100', 0);
		await vi.waitFor(() =>
			expect((screen.getByRole('button', { name: 'Simple' }) as HTMLButtonElement).disabled).toBe(
				false,
			),
		);
	});

	it('goes back to simple from detail with what was typed there', async () => {
		await editing();
		await detail();
		await type('Amount', '75', 0);
		await fireEvent.click(screen.getByRole('button', { name: 'Simple' }));

		expect(((await screen.findByLabelText(/^Amount/)) as HTMLInputElement).value).toBe('75');
		expect(screen.queryByLabelText(/^Account/)).toBeNull();
	});

	describe('a bank statement entry, with the amount on the second line and a balance on the first', () => {
		const statement = {
			...read,
			form: {
				...read.form,
				postings: [
					{ ...posting('Assets:Checking:HDFC', ''), balance: '2182947.61' },
					posting('Expenses:Travel:Uber', '270.00'),
				],
			},
		};

		beforeEach(() => {
			vi.mocked(findTransaction).mockReturnValue(answer(statement));
			vi.mocked(saveTransaction).mockResolvedValue(done);
		});

		it('opens in simple, and writes the balance back to the same account', async () => {
			await editing();

			expect((screen.getByLabelText(/^Amount/) as HTMLInputElement).value).toBe('270.00');
			expect((screen.getByLabelText(/^Category/) as HTMLInputElement).value).toBe(
				'Expenses:Travel:Uber',
			);

			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

			await vi.waitFor(() => expect(saveTransaction).toHaveBeenCalled());
			expect(vi.mocked(saveTransaction).mock.calls[0]?.[0]).toMatchObject({
				form: {
					postings: [
						{ account: 'Expenses:Travel:Uber', amount: '270.00', balance: '' },
						{ account: 'Assets:Checking:HDFC', amount: '', balance: '2182947.61' },
					],
				},
			});
		});

		it('drops the balance when its account is changed to another', async () => {
			await editing();
			await type('Paid from', 'Assets:Cash');
			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

			await vi.waitFor(() => expect(saveTransaction).toHaveBeenCalled());
			expect(vi.mocked(saveTransaction).mock.calls[0]?.[0]).toMatchObject({
				form: { postings: [{}, { account: 'Assets:Cash', balance: '' }] },
			});
		});
	});

	it('keeps a time and comment the simple view does not show', async () => {
		vi.mocked(findTransaction).mockReturnValue(
			answer({ ...read, form: { ...read.form, time: '09:30:00', comment: 'receipt' } }),
		);
		vi.mocked(saveTransaction).mockResolvedValue(done);
		await editing();
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await vi.waitFor(() => expect(saveTransaction).toHaveBeenCalled());
		expect(vi.mocked(saveTransaction).mock.calls[0]?.[0]).toMatchObject({
			form: { time: '09:30:00', comment: 'receipt' },
		});
	});

	it('saves the changes against the version it read, then leaves the panel', async () => {
		vi.mocked(saveTransaction).mockResolvedValue(done);
		await editing();
		await type('Description', 'Groceries and fruit');
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('?at=2026-08'));
		expect(vi.mocked(saveTransaction).mock.calls[0]?.[0]).toMatchObject({
			handle: 'h',
			file: 'a.rupea',
			line: 5,
			version: 'v1',
			form: { description: 'Groceries and fruit' },
		});
	});

	it('says why the server refused, and stays', async () => {
		vi.mocked(saveTransaction).mockResolvedValue({
			ok: false,
			data: null,
			errors: [fault('StorageConflict', { key: 'a.rupea', expected: 'v1', actual: 'v2' })],
		} as never);
		await editing();
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect((await screen.findByRole('alert')).textContent).toBeTruthy();
		expect(goto).not.toHaveBeenCalled();
	});

	it('deletes it, then leaves the panel', async () => {
		vi.mocked(deleteTransaction).mockResolvedValue({
			ok: true,
			data: undefined,
			errors: [],
		} as never);
		await editing();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('?at=2026-08'));
		expect(vi.mocked(deleteTransaction).mock.calls[0]?.[0]).toEqual({
			handle: 'h',
			file: 'a.rupea',
			line: 5,
			version: 'v1',
		});
	});

	it('keeps the panel when a delete is refused', async () => {
		vi.mocked(deleteTransaction).mockResolvedValue({
			ok: false,
			data: null,
			errors: [fault('TransactionNotFound', { path: 'a.rupea', line: 5 })],
		} as never);
		await editing();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		expect((await screen.findByRole('alert')).textContent).toContain('no longer where it was');
		expect(goto).not.toHaveBeenCalled();
	});
});

describe('the lines of an entry', () => {
	const suggested = () =>
		[...document.querySelectorAll('#transaction-accounts option')].map((o) =>
			o.getAttribute('value'),
		);

	beforeEach(() => {
		vi.mocked(createTransaction).mockReset();
		vi.mocked(findTransactionFiles).mockReturnValue(
			answer({ keys: ['b.rupea'], newest: 'b.rupea' }),
		);
	});

	it('suggests accounts of the kind as someone comes to a box or types in it', async () => {
		await opened();
		await fireEvent.focus(screen.getByLabelText(/^Category/));
		await type('Paid from', 'Ba');

		await vi.waitFor(() => expect(suggested()).toEqual(['Assets:Bank']));
	});

	it('suggests accounts by what is typed in a line, and not by kind', async () => {
		await opened();
		await detail();
		const [account] = (await screen.findAllByLabelText(/^Account/)) as HTMLInputElement[];
		await fireEvent.focus(account!);
		await fireEvent.input(account!, { target: { value: 'Exp' } });

		await vi.waitFor(() => expect(suggested()).toEqual(['Expenses', 'Expenses:Food']));
	});

	it('writes the extra fields of a line, which open and close with its button', async () => {
		vi.mocked(createTransaction).mockResolvedValue({
			ok: true,
			data: { file: 'b.rupea', line: 3 },
			errors: [],
		} as never);
		await opened();
		await detail();
		await type('Description', 'Buy');
		await type('Account', 'Assets:Broker', 0);
		await type('Amount', '5', 0);
		await type('Currency', 'AAPL', 0);
		await type('Account', 'Assets:Bank', 1);

		expect(screen.queryByLabelText(/^Lot cost/)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'More about line 1' }));
		await type('Price', '180.25 USD');
		await fireEvent.click(screen.getByLabelText('Price for all units'));
		await type('Lot cost', '900');
		await type('Lot date', '2026-01-02');
		await type('Balance after', '5');
		await type('Comment', 'bought on a dip', 0);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Add detail' })[0]!);
		await type('Key', 'order');
		await type('Value', 'A-1');
		expect(screen.getByRole('button', { name: 'More about line 1' }).textContent).toContain(
			'Hide extra fields',
		);
		await fireEvent.click(screen.getByRole('button', { name: 'More about line 1' }));
		expect(screen.queryByLabelText(/^Lot cost/)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'More about line 1' }));
		await save();

		await vi.waitFor(() => expect(createTransaction).toHaveBeenCalled());
		expect(vi.mocked(createTransaction).mock.calls[0]?.[0].form.postings[0]).toMatchObject({
			account: 'Assets:Broker',
			commodity: 'AAPL',
			price: '180.25 USD',
			total: true,
			cost: '900',
			costDate: '2026-01-02',
			balance: '5',
			comment: 'bought on a dip',
			metadata: [{ key: 'order', value: 'A-1' }],
		});
	});

	it('opens the extra fields of a line that has something wrong in them', async () => {
		await opened();
		await detail();
		await type('Description', 'Buy');
		await type('Account', 'Assets:Broker', 0);
		await type('Amount', '5', 0);
		await type('Account', 'Assets:Bank', 1);
		await fireEvent.click(screen.getByRole('button', { name: 'More about line 1' }));
		await type('Price', 'dear');
		await fireEvent.click(screen.getByRole('button', { name: 'More about line 1' }));
		expect(screen.queryByLabelText(/^Lot cost/)).toBeNull();

		await save();

		expect(await screen.findByText('Write a price, like 180.25 USD.')).toBeTruthy();
		expect(screen.getByLabelText(/^Lot cost/)).toBeTruthy();
		expect(createTransaction).not.toHaveBeenCalled();
	});

	it('takes a line out of three with its button, and puts a detail on the entry', async () => {
		await opened();
		await detail();
		await fireEvent.click(screen.getByRole('button', { name: 'Add a line' }));
		await type('Account', 'Assets:Cash', 2);
		await fireEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));

		await vi.waitFor(() => expect(screen.getAllByLabelText(/^Account/)).toHaveLength(2));
		expect((screen.getAllByLabelText(/^Account/)[1] as HTMLInputElement).value).toBe('Assets:Cash');
	});
});
