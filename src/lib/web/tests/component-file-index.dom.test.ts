import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteFiles, listFiles, renameFiles } from '#lib/endpoints/files.remote.ts';
import FileIndex from '#lib/web/components/file-index/file-index.svelte';
import { answer } from '#tests/shared/queries.ts';

vi.mock('#lib/endpoints/files.remote.ts', () => ({
	listFiles: vi.fn(),
	renameFiles: vi.fn(),
	deleteFiles: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const file = (key: string) => ({ key, modified: new Date('2026-10-01T10:00:00Z'), size: 2048 });

const rendered = (keys: string[]) => {
	vi.mocked(listFiles).mockReturnValue(answer(keys.map(file)));
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
