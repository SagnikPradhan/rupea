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
import { fault } from '#lib/server/shared/result/error.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/transactions/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccountNames: vi.fn(() => answer(['Assets:Bank'])),
	listAccountTree: vi.fn(() => answer([])),
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
	return screen.findByLabelText('Description');
};

const fileBox = async () => {
	await fireEvent.click(screen.getByRole('button', { name: 'More details' }));
	return (await screen.findByLabelText('File')) as HTMLInputElement;
};

const type = (label: string, value: string, index = 0) =>
	fireEvent.input(screen.getAllByLabelText(label)[index]!, { target: { value } });

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
		vi.mocked(findTransactionFiles).mockReturnValue(
			answer({ keys: ['a.rupea', 'b.rupea'], newest: 'b.rupea' }),
		);
	});

	it('picks the file with the latest transaction, and starts a file in an empty ledger', async () => {
		await opened();
		expect((await fileBox()).value).toBe('b.rupea');

		document.body.innerHTML = '';
		vi.mocked(findTransactionFiles).mockReturnValue(answer({ keys: [], newest: null }));
		await opened();
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
		expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('');
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
		expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Groceries');
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
		await fireEvent.click(screen.getByRole('button', { name: 'Split' }));

		const accounts = (await screen.findAllByLabelText('Account')) as HTMLInputElement[];
		expect(accounts.map((a) => a.value)).toEqual(['Expenses:Food', '']);
		expect(screen.queryByRole('button', { name: /Remove line/ })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
		expect(await screen.findAllByLabelText('Account')).toHaveLength(3);

		await fireEvent.click(screen.getByRole('button', { name: 'Remove line 3' }));
		await vi.waitFor(() => expect(screen.getAllByLabelText('Account')).toHaveLength(2));
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
		visit('/l/h/transactions?edit=a.rupea:5&at=2026-08');
		render(Page, { data });
		return (await screen.findByLabelText('Description')) as HTMLInputElement;
	};

	beforeEach(() => {
		vi.mocked(saveTransaction).mockReset();
		vi.mocked(deleteTransaction).mockReset();
		vi.mocked(goto).mockClear();
		vi.mocked(findTransaction).mockReturnValue(answer(read));
	});

	it('shows the transaction as it is written, in lines', async () => {
		expect((await editing()).value).toBe('Groceries');
		expect(screen.getAllByLabelText('Account')).toHaveLength(2);
		expect((screen.getAllByLabelText('Amount')[0] as HTMLInputElement).value).toBe('100.50');
		expect(screen.queryByLabelText('File')).toBeNull();
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
