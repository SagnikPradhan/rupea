import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteFiles, listFiles, renameFiles } from '#lib/endpoints/files.remote.ts';
import { listStatements } from '#lib/endpoints/import.remote.ts';
import FileIndex from '#lib/web/components/app-file-index/app-file-index.svelte';
import { answer } from '#tests/shared/queries.ts';

vi.mock('#lib/endpoints/files.remote.ts', () => ({
	listFiles: vi.fn(),
	renameFiles: vi.fn(),
	deleteFiles: vi.fn(),
}));

vi.mock('#lib/endpoints/import.remote.ts', () => ({ listStatements: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const file = (key: string) => ({ key, modified: '2026-10-01T10:00:00Z', size: 2048 });

const rendered = (keys: string[], statements: { key: string; file: string | null }[] = []) => {
	vi.mocked(listFiles).mockReturnValue(answer(keys.map(file)));
	vi.mocked(listStatements).mockReturnValue(answer(statements));
	vi.mocked(renameFiles).mockResolvedValue({ ok: true, data: [], errors: [] });
	vi.mocked(deleteFiles).mockResolvedValue({ ok: true, data: [], errors: [] });
	render(FileIndex, { handle: 'h' });
	return userEvent.setup();
};

const keys = ['bank/a.rupea', 'bank/b.rupea', 'bank/c.rupea', 'imports/x.csv'];

describe('the file index', () => {
	it('says when there are no files', async () => {
		rendered([]);

		expect(await screen.findByText('No files yet.')).toBeTruthy();
	});

	it('shows a statement and its draft as one row, which selects the draft', async () => {
		const draft = '_/20261121/hdfc.xls.rupea';
		const user = rendered(
			['bank/a.rupea', draft],
			[
				{ key: '20261121/hdfc.xls', file: draft },
				{ key: '20261121/odd.csv', file: null },
			],
		);
		const link = await screen.findByRole('link', { name: 'hdfc.xls' });

		expect(link.getAttribute('href')).toBe('/l/h/files/_/20261121/hdfc.xls');
		expect(screen.queryByRole('link', { name: 'hdfc.xls.rupea' })).toBeNull();
		expect(screen.queryByLabelText('Select _/20261121/odd.csv')).toBeNull();

		await user.click(screen.getByLabelText('Select _/20261121/hdfc.xls'));
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await user.click(
			within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
				name: 'Delete',
			}),
		);
		expect(deleteFiles).toHaveBeenCalledWith({ handle: 'h', keys: [draft] });
	});

	it('moves the chosen files into a folder', async () => {
		const user = rendered(keys);
		await user.click(await screen.findByLabelText('Select bank/'));
		expect(screen.getByText('3 selected')).toBeTruthy();

		await user.click(screen.getByRole('button', { name: 'Move' }));
		await user.type(screen.getByPlaceholderText('bank/2026'), 'bank');
		await user.click(screen.getByRole('button', { name: 'Move' }));
		expect(renameFiles).toHaveBeenCalledWith({ handle: 'h', moves: [] });

		await user.click(screen.getByLabelText('Select all files'));
		await user.click(screen.getByRole('button', { name: 'Move' }));
		await user.clear(screen.getByPlaceholderText('bank/2026'));
		await user.type(screen.getByPlaceholderText('bank/2026'), 'old');
		await user.click(screen.getByRole('button', { name: 'Move' }));
		expect(renameFiles).toHaveBeenLastCalledWith({
			handle: 'h',
			moves: keys.map((k) => ({ from: k, to: `old/${k.split('/')[1]}` })),
		});
	});

	it('marks the files between two clicks when shift is held', async () => {
		rendered(keys);
		await fireEvent.click(await screen.findByLabelText('Select bank/a.rupea'));
		await fireEvent.click(screen.getByLabelText('Select bank/c.rupea'), { shiftKey: true });

		expect(screen.getByText('3 selected')).toBeTruthy();
		expect(screen.getByLabelText('Select imports/x.csv')).toHaveProperty('checked', false);
	});

	it('deletes the chosen files only once confirmed', async () => {
		const user = rendered(keys);
		await user.click(await screen.findByLabelText('Select imports/x.csv'));
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await user.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(deleteFiles).not.toHaveBeenCalled();

		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(screen.getByText('Select all')).toBeTruthy());
		expect(deleteFiles).toHaveBeenCalledWith({ handle: 'h', keys: ['imports/x.csv'] });
	});

	it('folds a folder away', async () => {
		const user = rendered(keys);
		await user.click(await screen.findByRole('button', { name: 'bank/' }));

		expect(screen.queryByLabelText('Select bank/a.rupea')).toBeNull();
		expect(screen.getByRole('button', { name: 'bank/' }).getAttribute('aria-expanded')).toBe(
			'false',
		);
	});
});
