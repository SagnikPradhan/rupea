import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
import { fault } from '#lib/server/shared/result/error.ts';
import { goto } from '#tests/shared/app-navigation.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer, respond } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/import/+page.svelte';

vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/files.remote.ts', () => ({
	addFile: vi.fn(),
	createFile: vi.fn(),
	deleteFiles: vi.fn(),
	editFile: vi.fn(),
	findLatestFile: vi.fn(),
	listFiles: vi.fn(),
	parseFile: vi.fn(),
	readFile: vi.fn(),
	renameFiles: vi.fn(),
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
const showing = (path = '/l/h/import', running: unknown[] = jobs, vary = () => {}) => {
	visit(path);
	vi.mocked(listStatements).mockReturnValue(answer(statements));
	vi.mocked(listImports).mockReturnValue(answer(running));
	vi.mocked(listFiles).mockReturnValue(
		answer([{ key: 'hdfc.rupea' }, { key: '_/imports/sep.rupea' }]),
	);
	vi.mocked(findLatestFile).mockReturnValue(answer(null));
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
	const view = render(Page, { data });
	return { ...view, user: userEvent.setup() };
};

const rowOf = (name: RegExp) => screen.findByRole('row', { name });

describe('the import page', () => {
	it('lists each statement with where it stands, and why one failed', async () => {
		showing();

		expect((await rowOf(/hdfc\.xls/)).textContent).toContain('New');
		expect((await rowOf(/sep\.xls/)).textContent).toContain('Ready to add');
		expect((await rowOf(/aug\.xls/)).textContent).toContain('Added');
		expect((await rowOf(/b\.ledger/)).textContent).toContain('Failed');
		expect((await rowOf(/odd\.csv/)).textContent).toContain('Needs setup');
		expect(screen.getByText('CannotReadFile : bad')).toBeTruthy();
	});

	it('opens a statement uploaded alone', async () => {
		const { user } = showing();
		respond(uploadStatements, ['new.xls']);
		await user.upload(await screen.findByLabelText('Statements'), new File(['x'], 'new.xls'));

		await waitFor(() => expect(goto).toHaveBeenCalledWith('?statement=new.xls'));
	});

	it('deletes a statement once asked again', async () => {
		const { user } = showing();
		await user.click(await screen.findByRole('button', { name: 'Delete hdfc.xls' }));
		await user.click(screen.getByRole('button', { name: 'Delete' }));

		expect(deleteStatements).toHaveBeenCalledWith({ handle: 'h', keys: ['hdfc.xls'] });
	});

	it('polls running imports, and lists what they made once done', async () => {
		const { unmount } = showing('/l/h/import', [
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
		const { user } = showing('/l/h/import?statement=hdfc.xls');
		expect(await screen.findByText(/1 transaction found/)).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Transactions found' }).textContent).toContain('NEFT');
		expect(screen.queryByLabelText('Format')).toBeNull();

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
		const { user } = showing('/l/h/import?statement=hdfc.xls', jobs, () =>
			vi.mocked(findLatestFile).mockReturnValue(answer('hdfc.rupea')),
		);
		await user.click(await screen.findByRole('button', { name: 'Add to ledger' }));

		expect(screen.getByLabelText<HTMLInputElement>('Add to file').value).toBe('hdfc.rupea');
		expect(screen.getByText(/Adds them to this file by date/)).toBeTruthy();
		expect(findLatestFile).toHaveBeenCalledWith({ handle: 'h', account: 'Assets:Bank:HDFC' });
	});

	it('undoes a move by moving the file back to review', async () => {
		const { user } = showing('/l/h/import?statement=hdfc.xls');
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
		const { user } = showing('/l/h/import?statement=hdfc.xls', jobs, () =>
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

	it('files a draft and opens it to edit', async () => {
		const { user } = showing('/l/h/import?statement=hdfc.xls');
		await user.click(await screen.findByRole('button', { name: 'Edit transactions' }));

		await waitFor(() =>
			expect(goto).toHaveBeenCalledWith('/l/h/files?file=_%2Fimports%2Fhdfc.rupea'),
		);
	});

	it('opens its format on asking', async () => {
		const { user } = showing('/l/h/import?statement=hdfc.xls');
		await user.click(await screen.findByRole('button', { name: 'Read it with another format' }));

		expect(screen.getByLabelText<HTMLTextAreaElement>('Format').value).toBe('name: HDFC');
	});
});

describe('a statement with a draft in review', () => {
	it('shows the draft, which moves to the ledger as it is', async () => {
		const { user } = showing('/l/h/import?statement=sep.xls');
		expect(await screen.findByText(/1 transaction found/)).toBeTruthy();
		expect(readStatement).not.toHaveBeenCalled();

		await user.click(screen.getByRole('button', { name: 'Add to ledger' }));
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

	it('starts over by throwing the draft away', async () => {
		const { user } = showing('/l/h/import?statement=sep.xls');
		await user.click(await screen.findByRole('button', { name: 'Start over' }));
		await user.click(screen.getByRole('button', { name: 'Start over' }));

		expect(deleteFiles).toHaveBeenCalledWith({ handle: 'h', keys: ['_/imports/sep.rupea'] });
	});
});

describe('a statement added already', () => {
	it('links the file it is in', async () => {
		showing('/l/h/import?statement=aug.xls');

		const link = await screen.findByRole('link', { name: 'hdfc/aug.rupea' });
		expect(link.getAttribute('href')).toBe('/l/h/files?file=hdfc%2Faug.rupea');
	});
});

describe('a statement Rupea does not know', () => {
	const unknown = () =>
		showing('/l/h/import?statement=hdfc.xls', jobs, () =>
			vi
				.mocked(recogniseStatement)
				.mockReturnValue(failed(fault('ExtractionUnrecognised', { path: 'hdfc.xls' }))),
		);

	it('asks for its format beside the statement, reading it again as it changes', async () => {
		unknown();
		expect(await screen.findByRole('heading', { name: 'Describe this statement' })).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Statement' }).textContent).toContain('Narration');

		await fireEvent.input(screen.getByLabelText('Format'), { target: { value: 'name: Mine' } });
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
			expect(screen.getByLabelText<HTMLTextAreaElement>('Format').value).toBe('name: Saved'),
		);

		await user.click(screen.getByRole('button', { name: 'Save format' }));
		expect(await screen.findByText('Saved.')).toBeTruthy();
		expect(saveSchema).toHaveBeenCalledWith({
			handle: 'h',
			key: 'hdfc.yml',
			content: 'name: Saved',
		});

		await user.click(screen.getByRole('button', { name: 'Delete hdfc.yml' }));
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		expect(deleteSchema).toHaveBeenCalledWith({ handle: 'h', key: 'hdfc.yml' });
	});

	it('starts from the example', async () => {
		const { user } = unknown();
		await user.click(await screen.findByRole('button', { name: 'The example' }));

		expect(screen.getByLabelText<HTMLTextAreaElement>('Format').value).toContain(
			'name: HDFC Bank savings account',
		);
	});
});

describe('a locked statement', () => {
	it('asks for its password, then reads it', async () => {
		const { user } = showing('/l/h/import?statement=hdfc.xls', jobs, () =>
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
