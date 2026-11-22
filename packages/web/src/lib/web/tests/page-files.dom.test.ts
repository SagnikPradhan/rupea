import { EditorView } from '@codemirror/view';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	editFile,
	findTransactionAt,
	formatFile,
	listFiles,
	parseFile,
	readFile,
} from '#lib/endpoints/files.remote.ts';
import { listGroups, listSuggestions } from '#lib/endpoints/refinement.remote.ts';
import { beforeNavigate, goto } from '#tests/shared/app-navigation.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { listImports, listStatements } from '#lib/endpoints/import.remote.ts';
import { answer } from '#tests/shared/queries.ts';
import Index from '#routes/(signed-in)/l/[handle]/files/+page.svelte';
import Page from '#routes/(signed-in)/l/[handle]/files/[...key]/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({ listAccounts: vi.fn() }));
vi.mock('#lib/endpoints/files.remote.ts', () => ({
	addFile: vi.fn(),
	findLatestFile: vi.fn(),
	findTransactionAt: vi.fn(),
	createTransaction: Object.assign(vi.fn(), { pending: 0 }),
	saveTransaction: Object.assign(vi.fn(), { pending: 0 }),
	deleteTransaction: Object.assign(vi.fn(), { pending: 0 }),
	createFile: vi.fn(),
	deleteFiles: vi.fn(),
	editFile: vi.fn(),
	formatFile: vi.fn(),
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
	saveSchema: vi.fn(),
}));
vi.mock('#lib/endpoints/refinement.remote.ts', () => ({
	listGroups: vi.fn(),
	listSuggestions: vi.fn(),
	makePrimary: vi.fn(),
	renameGroup: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const bank = {
	key: 'bank.rupea',
	content: 'one',
	version: '1',
	size: 3,
	modified: '2026-10-01T00:00:00Z',
};

const showing = (path: string, before: () => void = () => {}) => {
	visit(path);
	vi.mocked(listFiles).mockReturnValue(answer([]));
	vi.mocked(listGroups).mockReturnValue(answer([]));
	vi.mocked(listImports).mockReturnValue(answer([]));
	vi.mocked(listStatements).mockReturnValue(answer([]));
	vi.mocked(listSuggestions).mockReturnValue(answer([{}, {}]));
	vi.mocked(readFile).mockResolvedValue({ ok: true, data: bank, errors: [] });
	vi.mocked(parseFile).mockResolvedValue({ ok: true, data: [], errors: [] });
	vi.mocked(formatFile).mockImplementation(
		({ content }) => Promise.resolve({ ok: true, data: content, errors: [] }) as never,
	);
	vi.mocked(editFile).mockImplementation(
		({ content }) =>
			Promise.resolve({ ok: true, data: { ...bank, content, version: '2' }, errors: [] }) as never,
	);
	before();
	render(path.startsWith('/l/h/files/') ? Page : Index, { data });
	return userEvent.setup();
};

const leaving = () => {
	const cancel = vi.fn();
	const guard = vi.mocked(beforeNavigate).mock.calls[0]?.[0];
	guard?.({ willUnload: false, cancel } as never);
	return cancel;
};

const tea = {
	file: 'bank.rupea',
	line: 2,
	date: '2026-08-29',
	time: null,
	description: 'Tea',
	comment: null,
	postings: [
		{ account: 'Expenses:Food', quantity: '10' },
		{ account: 'Assets:Cash', quantity: '-10' },
	],
};

describe('the files page', () => {
	it('shows a file as its transactions in the UI view, each linking to its edit', async () => {
		showing('/l/h/files/bank.rupea?view=ui', () =>
			vi.mocked(parseFile).mockResolvedValue({ ok: true, data: [tea], errors: [] }),
		);

		const link = await screen.findByRole('link', { name: 'Tea' });
		expect(link.getAttribute('href')).toBe('/l/h/files/bank.rupea?view=ui&edit=2');
		expect(screen.queryByRole('textbox')).toBeNull();
		expect(screen.getByRole('link', { name: 'Text' }).getAttribute('href')).toBe(
			'/l/h/files/bank.rupea?view=text',
		);
	});

	it('opens the transaction form beside the list to edit one', async () => {
		showing('/l/h/files/bank.rupea?view=ui&edit=2', () =>
			vi.mocked(findTransactionAt).mockReturnValue(
				answer({
					file: 'bank.rupea',
					line: 2,
					version: '1',
					form: {
						file: 'bank.rupea',
						date: '2026-08-29',
						time: '',
						description: 'Tea',
						comment: '',
						metadata: [],
						postings: [],
					},
				}) as never,
			),
		);

		expect(await screen.findByRole('complementary', { name: 'Edit transaction' })).toBeTruthy();
		expect(findTransactionAt).toHaveBeenCalledWith({ handle: 'h', file: 'bank.rupea', line: 2 });
	});

	it('lists the files when none is open', async () => {
		showing('/l/h/files');

		expect(await screen.findByText('No files yet.')).toBeTruthy();
		expect(readFile).not.toHaveBeenCalled();
		expect(leaving()).not.toHaveBeenCalled();
	});

	it('opens the chosen file, and offers to find its matches', async () => {
		showing('/l/h/files/bank.rupea');

		await waitFor(() => expect(readFile).toHaveBeenCalledWith({ handle: 'h', key: 'bank.rupea' }));
		expect((await screen.findByRole('link', { name: 'Find matches' })).getAttribute('href')).toBe(
			'/l/h/refine?file=bank.rupea',
		);
		expect(screen.getByRole('link', { name: 'All files' }).getAttribute('href')).toBe('/l/h/files');
	});

	it('counts the matches a save turned up, and holds navigation while unsaved', async () => {
		const user = showing('/l/h/files/bank.rupea');
		await screen.findByRole('link', { name: 'Find matches' });
		const view = EditorView.findFromDOM(screen.getByRole('textbox'));
		view?.dispatch({ changes: { from: 3, insert: ' two' } });

		vi.stubGlobal('confirm', () => false);
		expect(leaving()).toHaveBeenCalled();
		vi.unstubAllGlobals();

		await user.click(screen.getByRole('button', { name: 'Save' }));
		expect(await screen.findByRole('link', { name: '2 possible matches: review' })).toBeTruthy();
		expect(listSuggestions).toHaveBeenCalledWith({ handle: 'h', file: 'bank.rupea' });
		expect(goto).not.toHaveBeenCalled();
	});

	it('lets the import review open and close over unsaved edits, but not another file', async () => {
		showing('/l/h/files/bank.rupea');
		await screen.findByRole('link', { name: 'Find matches' });
		const view = EditorView.findFromDOM(screen.getByRole('textbox'));
		view?.dispatch({ changes: { from: 3, insert: ' two' } });
		vi.stubGlobal('confirm', () => false);
		const guard = vi.mocked(beforeNavigate).mock.calls[0]?.[0];
		const to = (path: string) => ({ url: new URL(`https://rupea.test/l/h/files/${path}`) });

		const review = vi.fn();
		guard?.({
			willUnload: false,
			cancel: review,
			to: to('bank.rupea'),
		} as never);
		expect(review).not.toHaveBeenCalled();

		const other = vi.fn();
		guard?.({ willUnload: false, cancel: other, to: to('other.rupea') } as never);
		expect(other).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('offers the import panel on the index, without matches', async () => {
		showing('/l/h/files');

		expect(await screen.findByRole('heading', { name: 'Import statements' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Matches' })).toBeNull();
	});

	it('offers the matches, not the import panel, once a file is open', async () => {
		showing('/l/h/files/bank.rupea');

		expect(await screen.findByRole('heading', { name: 'Matches' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Import statements' })).toBeNull();
	});

	it('titles a counted file by its key', async () => {
		showing('/l/h/files/bank.rupea');

		await screen.findByRole('heading', { name: 'Matches' });
		expect(document.querySelector('h1 + p')?.textContent).toContain('bank.rupea');
	});

	it('titles the page Files, over your files and the import panel, in that order', async () => {
		showing('/l/h/files');

		expect(await screen.findByRole('heading', { level: 1, name: 'Files' })).toBeTruthy();
		const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
		expect(titles).toEqual(['Your files', 'Import statements']);
	});

	it('offers New file at the header, linking to the new file page', async () => {
		showing('/l/h/files');

		const link = await screen.findByRole('link', { name: 'New file' });
		expect(link.getAttribute('href')).toBe('/l/h/files/new.rupea');
	});

	it('counts the files in your files', async () => {
		showing('/l/h/files', () =>
			vi.mocked(listFiles).mockReturnValue(answer([bank, { ...bank, key: 'b.rupea' }])),
		);

		expect(await screen.findByText('2 files')).toBeTruthy();
	});
});
