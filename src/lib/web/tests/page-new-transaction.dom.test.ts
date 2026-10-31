import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransaction, findTransactionFiles } from '#lib/endpoints/files.remote.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/transactions/new/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	listAccountNames: vi.fn(() => answer(['Assets:Bank'])),
}));
vi.mock('#lib/endpoints/files.remote.ts', () => ({
	findTransactionFiles: vi.fn(),
	createTransaction: Object.assign(vi.fn(), { pending: 0 }),
}));

const opened = async () => {
	visit('/l/h/transactions/new');
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

describe('the add transaction page', () => {
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
		await fireEvent.click(screen.getByRole('button', { name: 'Split into several lines' }));

		const accounts = (await screen.findAllByLabelText('Account')) as HTMLInputElement[];
		expect(accounts.map((a) => a.value)).toEqual(['Expenses:Food', '']);
		expect(screen.queryByRole('button', { name: /Remove line/ })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
		expect(await screen.findAllByLabelText('Account')).toHaveLength(3);

		await fireEvent.click(screen.getByRole('button', { name: 'Remove line 3' }));
		await vi.waitFor(() => expect(screen.getAllByLabelText('Account')).toHaveLength(2));
	});
});
