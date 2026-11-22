import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	addFile,
	createFile,
	deleteFiles,
	editFile,
	findLatestFile,
	listFiles,
	parseFile,
	readFile,
	renameFiles,
} from '#lib/endpoints/files.remote.ts';
import { listGroups, listSuggestions } from '#lib/endpoints/refinement.remote.ts';
import {
	deleteStatements,
	importStatement,
	listImports,
	listStatements,
	previewStatement,
	readStatement,
	recogniseStatement,
	unlockStatement,
	uploadStatements,
} from '#lib/endpoints/import.remote.ts';
import {
	deleteSchema,
	listSchemas,
	readSchema,
	saveSchema,
} from '#lib/endpoints/schemas.remote.ts';
import { fault } from '@rupea/shared/errors.ts';
import { goto } from '#tests/shared/app-navigation.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer, respond } from '#tests/shared/queries.ts';
import Index from '#routes/(signed-in)/l/[handle]/files/+page.svelte';
import Page from '#routes/(signed-in)/l/[handle]/files/[...key]/+page.svelte';

vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({ listAccounts: vi.fn() }));
vi.mock('#lib/endpoints/files.remote.ts', () => ({
	addFile: vi.fn(),
	createFile: vi.fn(),
	deleteFiles: vi.fn(),
	editFile: vi.fn(),
	findLatestFile: vi.fn(),
	findTransactionAt: vi.fn(),
	createTransaction: Object.assign(vi.fn(), { pending: 0 }),
	saveTransaction: Object.assign(vi.fn(), { pending: 0 }),
	deleteTransaction: Object.assign(vi.fn(), { pending: 0 }),
	formatFile: vi.fn(),
	listFiles: vi.fn(),
	parseFile: vi.fn(),
	readFile: vi.fn(),
	renameFiles: vi.fn(),
}));
vi.mock('#lib/endpoints/refinement.remote.ts', () => ({
	listGroups: vi.fn(),
	listSuggestions: vi.fn(),
	makePrimary: vi.fn(),
	renameGroup: vi.fn(),
}));
vi.mock('#lib/endpoints/import.remote.ts', async () => {
	const { fakeForm } = await import('#tests/shared/queries.ts');
	return {
		unlockStatement: fakeForm(),
		uploadStatements: fakeForm(),
		deleteStatements: vi.fn(),
		importStatement: vi.fn(),
		listImports: vi.fn(),
		listStatements: vi.fn(),
		previewStatement: vi.fn(),
		readStatement: vi.fn(),
		recogniseStatement: vi.fn(),
	};
});
vi.mock('#lib/endpoints/schemas.remote.ts', () => ({
	deleteSchema: vi.fn(),
	listSchemas: vi.fn(),
	readSchema: vi.fn(),
	saveSchema: Object.assign(vi.fn(), { pending: 0 }),
}));

afterEach(() => {
	vi.clearAllMocks();
});

const ok = (d: unknown) => Promise.resolve({ ok: true, data: d, errors: [] }) as never;

const failed = (e: unknown) => Promise.resolve({ ok: false, data: null, errors: [e] }) as never;

const grid = [
	['Date', 'Narration', 'Withdrawal Amt.'],
	['03/10/26', 'NEFT', '100.00'],
];

const found = {
	line: 2,
	date: '2026-10-03',
	time: null,
	description: 'NEFT',
	postings: [
		{ account: 'Assets:Bank:HDFC', quantity: '-100.00' },
		{ account: 'Expenses:Unknown', quantity: '100.00' },
	],
};

const addition = {
	file: { key: 'hdfc/2026-10.rupea', version: '2' },
	added: 1,
	skipped: 0,
	before: null,
	draft: 'drafted',
};

const statements = [
	{ key: 'hdfc.xls', file: null },
	{ key: 'sep.xls', file: '_/imports/sep.rupea' },
	{ key: 'aug.xls', file: 'hdfc/aug.rupea' },
	{ key: 'b.ledger', file: null },
	{ key: 'odd.csv', file: null },
];

const jobs = [
	{
		id: '1',
		statement: 'b.ledger',
		status: 'failed',
		error: fault('CannotReadFile', { path: 'b.ledger', reason: 'bad' }),
	},
	{ id: '2', statement: 'odd.csv', status: 'succeeded', error: null },
];

/** Renders the page at a path; `vary` changes a mock after the defaults are set. */
const showing = (path = '/l/h/files', running: unknown[] = jobs, vary = () => {}) => {
	visit(path);
	vi.mocked(listStatements).mockReturnValue(answer(statements));
	vi.mocked(listImports).mockReturnValue(answer(running));
	vi.mocked(listFiles).mockReturnValue(
		answer([
			{ key: 'hdfc.rupea', size: 3, modified: '2026-10-01T00:00:00Z' },
			{ key: '_/imports/sep.rupea', size: 3, modified: '2026-10-01T00:00:00Z' },
		]),
	);
	vi.mocked(findLatestFile).mockReturnValue(answer(null));
	vi.mocked(listGroups).mockReturnValue(answer([]));
	vi.mocked(listSuggestions).mockReturnValue(answer([]));
	vi.mocked(listSchemas).mockReturnValue(answer([{ key: 'hdfc.yml' }]));
	vi.mocked(readStatement).mockReturnValue(ok({ key: 'hdfc.xls', grid }));
	vi.mocked(recogniseStatement).mockReturnValue(ok({ key: 'hdfc.yml', content: 'name: HDFC' }));
	vi.mocked(previewStatement).mockReturnValue(ok([found]));
	vi.mocked(importStatement).mockReturnValue(ok({ key: '_/imports/hdfc.rupea' }));
	vi.mocked(readFile).mockReturnValue(ok({ key: '_/imports/sep.rupea', content: 'x' }));
	vi.mocked(parseFile).mockReturnValue(ok([found]));
	vi.mocked(renameFiles).mockReturnValue(ok([{ key: 'hdfc.rupea' }]));
	vi.mocked(addFile).mockReturnValue(ok(addition));
	vi.mocked(editFile).mockReturnValue(ok({ key: 'hdfc.rupea' }));
	vi.mocked(createFile).mockReturnValue(ok({ key: '_/imports/hdfc.rupea' }));
	vi.mocked(deleteFiles).mockReturnValue(ok(['_/imports/sep.rupea']));
	vi.mocked(deleteStatements).mockReturnValue(ok(['hdfc.xls']));
	vi.mocked(readSchema).mockReturnValue(ok({ content: 'name: Saved' }));
	vi.mocked(saveSchema).mockReturnValue(ok({ key: 'my-bank.yml' }));
	vi.mocked(deleteSchema).mockReturnValue(ok(undefined));
	vary();
	const view = render(path.startsWith('/l/h/files/') ? Page : Index, { data });
	return { ...view, user: userEvent.setup() };
};

const rowOf = async (name: RegExp) =>
	within(
		(await screen.findByRole('heading', { name: 'Import statements' })).closest('section')!,
	).findByRole('row', { name });

describe('the import panel', () => {
	it('lists each statement with where it stands, and why one failed', async () => {
		showing();

		expect((await rowOf(/hdfc\.xls/)).textContent).toContain('Just uploaded');
		expect((await rowOf(/sep\.xls/)).textContent).toContain('Ready to review');
		expect((await rowOf(/aug\.xls/)).textContent).toContain('Added to your ledger');
		expect((await rowOf(/b\.ledger/)).textContent).toContain('Failed');
		expect((await rowOf(/odd\.csv/)).textContent).toContain(
			'Rupea doesn’t recognise this bank yet',
		);
		expect(screen.getByText('CannotReadFile : bad')).toBeTruthy();
	});

	it('offers Review on a ready statement, Set up on an unrecognised one and Open on a failed one, and nothing else', async () => {
		showing();
		const review = within(await rowOf(/sep\.xls/)).getByRole('link', { name: 'Review' });
		const setup = within(await rowOf(/odd\.csv/)).getByRole('link', { name: 'Set up' });

		expect(review.getAttribute('href')).toContain('sep.xls');
		const open = within(await rowOf(/b\.ledger/)).getByRole('link', { name: 'Open' });

		expect(setup.getAttribute('href')).toContain('odd.csv');
		expect(open.getAttribute('href')).toContain('b.ledger');
		expect(
			within(await rowOf(/aug\.xls/)).queryByRole('link', { name: /Review|Set up|Open/ }),
		).toBeNull();
		expect(
			within(await rowOf(/hdfc\.xls/)).queryByRole('link', { name: /Review|Set up|Open/ }),
		).toBeNull();
	});

	it('hides the Review button while a statement asks to be deleted', async () => {
		const { user } = showing();
		const row = await rowOf(/sep\.xls/);
		expect(within(row).getByRole('link', { name: 'Review' })).toBeTruthy();

		await user.click(within(row).getByRole('button', { name: 'Delete sep.xls' }));

		expect(within(await rowOf(/sep\.xls/)).queryByRole('link', { name: 'Review' })).toBeNull();
	});

	it('opens a statement uploaded alone', async () => {
		const { user } = showing();
		respond(uploadStatements, ['new.xls']);
		await user.upload(await screen.findByLabelText('Statements'), new File(['x'], 'new.xls'));

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/l/h/files/_/new.xls'));
	});

	it('deletes a statement once asked again', async () => {
		const { user } = showing();
		await user.click(await screen.findByRole('button', { name: 'Delete hdfc.xls' }));
		await user.click(
			within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
				name: 'Delete',
			}),
		);

		expect(deleteStatements).toHaveBeenCalledWith({ handle: 'h', keys: ['hdfc.xls'] });
	});

	it('polls running imports, and lists what they made once done', async () => {
		const { unmount } = showing('/l/h/files', [
			{ id: '2', statement: 'b.ledger', status: 'running', error: null },
		]);

		expect((await rowOf(/b\.ledger/)).textContent).toContain('Reading…');
		await waitFor(() => expect(listImports).toHaveBeenCalledTimes(2), { timeout: 3000 });
		unmount();
		expect(listFiles).toHaveBeenCalledWith('h');
	});
});

describe('a statement Rupea knows', () => {
	it('shows what it found, and adds it to a new file named for its account and month', async () => {
		const { user } = showing('/l/h/files/_/hdfc.xls');
		expect(await screen.findByText(/1 transaction found/)).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Transactions found' }).textContent).toContain('NEFT');
		expect(screen.queryByLabelText('Schema')).toBeNull();

		await user.click(screen.getByRole('button', { name: 'Add to ledger' }));
		const where = screen.getByLabelText<HTMLInputElement>('Add to file');
		expect(where.value).toBe('hdfc/2026-10.rupea');
		expect(screen.getByText('Makes a new file.')).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Add' }));

		await waitFor(() =>
			expect(addFile).toHaveBeenCalledWith({
				handle: 'h',
				from: '_/imports/hdfc.rupea',
				to: 'hdfc/2026-10.rupea',
			}),
		);
		expect(importStatement).toHaveBeenCalledWith({
			handle: 'h',
			statement: 'hdfc.xls',
			schema: { key: 'hdfc.yml', content: 'name: HDFC' },
		});
		expect((await screen.findByText(/Added 1 to/)).textContent).not.toContain('Left out');
	});

	it('offers the file its account was last added to', async () => {
		const { user } = showing('/l/h/files/_/hdfc.xls', jobs, () =>
			vi.mocked(findLatestFile).mockReturnValue(answer('hdfc.rupea')),
		);
		await user.click(await screen.findByRole('button', { name: 'Add to ledger' }));

		expect((screen.getByRole('combobox', { name: 'Add to file' }) as HTMLInputElement).value).toBe(
			'hdfc.rupea',
		);
		expect(screen.getByText(/Adds them to this file by date/)).toBeTruthy();
		expect(findLatestFile).toHaveBeenCalledWith({ handle: 'h', account: 'Assets:Bank:HDFC' });
	});

	it('adds to a file chosen from those in the ledger', async () => {
		const { user } = showing('/l/h/files/_/hdfc.xls');
		await user.click(await screen.findByRole('button', { name: 'Add to ledger' }));
		const file = screen.getByRole('combobox', { name: 'Add to file' });
		await user.clear(file);
		await user.click(await screen.findByRole('option', { name: 'hdfc.rupea' }));
		await user.click(screen.getByRole('button', { name: 'Add' }));

		await waitFor(() =>
			expect(addFile).toHaveBeenCalledWith({
				handle: 'h',
				from: '_/imports/hdfc.rupea',
				to: 'hdfc.rupea',
			}),
		);
	});

	it('undoes a move by moving the file back to review', async () => {
		const { user } = showing('/l/h/files/_/hdfc.xls');
		await user.click(await screen.findByRole('button', { name: 'Add to ledger' }));
		await user.click(screen.getByRole('button', { name: 'Add' }));
		await user.click(await screen.findByRole('button', { name: 'Undo' }));

		expect(renameFiles).toHaveBeenCalledWith({
			handle: 'h',
			moves: [{ from: 'hdfc/2026-10.rupea', to: '_/imports/hdfc.rupea' }],
		});
		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
	});

	it('undoes a merge by putting the file back as it was, and the draft in review', async () => {
		const merged = {
			...addition,
			file: { key: 'hdfc.rupea', version: '2' },
			skipped: 2,
			before: 'old',
		};
		const { user } = showing('/l/h/files/_/hdfc.xls', jobs, () =>
			vi.mocked(addFile).mockReturnValue(ok(merged)),
		);
		await user.click(await screen.findByRole('button', { name: 'Add to ledger' }));
		await user.click(screen.getByRole('button', { name: 'Add' }));
		expect((await screen.findByText(/Added 1 to/)).textContent).toContain(
			'Left out 2 already there.',
		);
		await user.click(screen.getByRole('button', { name: 'Undo' }));

		expect(editFile).toHaveBeenCalledWith({
			handle: 'h',
			key: 'hdfc.rupea',
			content: 'old',
			version: '2',
		});
		expect(createFile).toHaveBeenCalledWith({
			handle: 'h',
			key: '_/imports/hdfc.rupea',
			content: 'drafted',
		});
	});

	it('files a draft to edit, without leaving the page', async () => {
		const { user } = showing('/l/h/files/_/hdfc.xls');
		await user.click(await screen.findByRole('button', { name: 'Edit transactions' }));

		await waitFor(() => expect(importStatement).toHaveBeenCalled());
		expect(goto).not.toHaveBeenCalled();
	});

	it('opens its format on asking', async () => {
		const { user } = showing('/l/h/files/_/hdfc.xls');
		await user.click(await screen.findByRole('button', { name: 'Read it with another schema' }));

		expect(screen.getByLabelText<HTMLTextAreaElement>('Schema').value).toBe('name: HDFC');
	});
});

describe('a statement with a draft in review', () => {
	it('shows the draft, which moves to the ledger as it is', async () => {
		const { user } = showing('/l/h/files/_/sep.xls');
		await user.click(await screen.findByRole('button', { name: 'Add to ledger' }));
		expect(readStatement).not.toHaveBeenCalled();
		await user.click(screen.getByRole('button', { name: 'Add' }));

		await waitFor(() =>
			expect(addFile).toHaveBeenCalledWith({
				handle: 'h',
				from: '_/imports/sep.rupea',
				to: 'hdfc/2026-10.rupea',
			}),
		);
		expect(importStatement).not.toHaveBeenCalled();
	});

	it('shows the statement the draft was made from, without the text controls', async () => {
		vi.mocked(readStatement).mockReturnValue(
			ok({ key: 'sep.xls', grid: [['Date'], ['29/08/26']] }),
		);
		showing('/l/h/files/_/sep.xls?view=statement');

		expect(await screen.findByRole('table', { name: 'Statement' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Statement' }).getAttribute('aria-current')).toBe(
			'page',
		);
		expect(screen.queryByRole('button', { name: 'Format' })).toBeNull();
		expect(readStatement).toHaveBeenCalledWith({ handle: 'h', statement: 'sep.xls' });
	});

	it('starts over by throwing the draft away', async () => {
		const { user } = showing('/l/h/files/_/sep.xls');
		await user.click(await screen.findByRole('button', { name: 'Delete' }));
		await user.click(
			within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
				name: 'Delete',
			}),
		);

		expect(deleteFiles).toHaveBeenCalledWith({ handle: 'h', keys: ['_/imports/sep.rupea'] });
	});
});

describe('a statement added already', () => {
	it('links the file it is in', async () => {
		showing('/l/h/files/_/aug.xls');

		const link = await screen.findByRole('link', { name: 'hdfc/aug.rupea' });
		expect(link.getAttribute('href')).toBe('/l/h/files/hdfc/aug.rupea');
	});
});

describe('a statement Rupea does not know', () => {
	const unknown = () =>
		showing('/l/h/files/_/hdfc.xls', jobs, () =>
			vi
				.mocked(recogniseStatement)
				.mockReturnValue(failed(fault('ExtractionUnrecognised', { path: 'hdfc.xls' }))),
		);

	it('asks for its format beside the statement, reading it again as it changes', async () => {
		unknown();
		expect(await screen.findByRole('heading', { name: 'Describe this statement' })).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Statement' }).textContent).toContain('Narration');

		await fireEvent.input(screen.getByLabelText('Schema'), { target: { value: 'name: Mine' } });
		await waitFor(() =>
			expect(previewStatement).toHaveBeenCalledWith({
				handle: 'h',
				statement: 'hdfc.xls',
				schema: { key: 'my-bank.yml', content: 'name: Mine' },
			}),
		);
	});

	it('starts from a saved format, then saves and deletes it', async () => {
		const { user } = unknown();
		await user.click(await screen.findByRole('button', { name: 'hdfc.yml' }));
		await waitFor(() =>
			expect(screen.getByLabelText<HTMLTextAreaElement>('Schema').value).toBe('name: Saved'),
		);

		await user.click(screen.getByRole('button', { name: 'Save schema' }));
		expect(await screen.findByText('Saved.')).toBeTruthy();
		expect(saveSchema).toHaveBeenCalledWith({
			handle: 'h',
			key: 'hdfc.yml',
			content: 'name: Saved',
		});

		await user.click(screen.getByRole('button', { name: 'Delete hdfc.yml' }));
		await user.click(
			within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
				name: 'Delete',
			}),
		);
		expect(deleteSchema).toHaveBeenCalledWith({ handle: 'h', key: 'hdfc.yml' });
	});

	it('starts from the example', async () => {
		const { user } = unknown();
		await user.click(await screen.findByRole('button', { name: 'The example' }));

		expect(screen.getByLabelText<HTMLTextAreaElement>('Schema').value).toContain(
			'name: HDFC Bank savings account',
		);
	});
});

describe('a locked statement', () => {
	it('asks for its password, then reads it', async () => {
		const { user } = showing('/l/h/files/_/hdfc.xls', jobs, () =>
			vi
				.mocked(readStatement)
				.mockReturnValue(failed(fault('ExtractionLocked', { path: 'hdfc.xls' }))),
		);
		const password = await screen.findByLabelText('This file has a password');

		respond(unlockStatement, { key: 'hdfc.xls', grid });
		await user.type(password, 'secret');
		await user.click(screen.getByRole('button', { name: 'Unlock' }));

		expect(await screen.findByText(/1 transaction found/)).toBeTruthy();
		expect(recogniseStatement).toHaveBeenCalledWith({ handle: 'h', statement: 'hdfc.xls' });
	});
});

describe('dropping statements', () => {
	it('uploads what is dropped on the aside, then opens the first', async () => {
		showing();
		respond(uploadStatements, ['new.xls']);
		const transfer = new DataTransfer();
		transfer.items.add(new File(['x'], 'new.xls'));

		await fireEvent.drop(await screen.findByRole('button', { name: /Drop statements here/ }), {
			dataTransfer: transfer,
		});

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/l/h/files/_/new.xls'));
	});
});

describe('the import review', () => {
	it('shows the statement in the page, with no dialog', async () => {
		showing('/l/h/files/_/hdfc.xls');

		expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
