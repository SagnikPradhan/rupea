import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createEditor } from '#lib/web/components/file-editor/file-editor.svelte.ts';
import FileEditor from '#lib/web/components/file-editor/file-editor.svelte';
import { fakeApi } from '#lib/web/tests/component-file-editor-fixture.ts';

const rendered = async (key: string | null = 'a.rupea') => {
	const fake = fakeApi({ 'a.rupea': 'one' });
	const editor = createEditor(fake.api, 0);
	await editor.open(key);
	const onopen = vi.fn();
	const onremoved = vi.fn();
	render(FileEditor, { handle: 'h', trail: [], editor, line: null, onopen, onremoved });
	return { ...fake, editor, onopen, onremoved, user: userEvent.setup() };
};

describe('the file editor', () => {
	it('offers Reload and Overwrite on a conflict, and Overwrite re-saves', async () => {
		const { user, editor, touch, disk } = await rendered();
		touch('a.rupea', 'elsewhere');
		editor.edit('one mine');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		expect(screen.getByText(/changed on disk/)).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Overwrite' }));

		expect(disk.get('a.rupea')?.content).toBe('one mine');
		expect(screen.queryByText(/changed on disk/)).toBeNull();
	});

	it('renames through the rename remote', async () => {
		const { user, api, onopen } = await rendered();
		await user.click(screen.getByRole('button', { name: 'Rename' }));
		await user.clear(screen.getByLabelText('Rename to'));
		await user.type(screen.getByLabelText('Rename to'), 'b.rupea');
		await user.click(screen.getByRole('button', { name: 'Rename' }));

		expect(api.rename).toHaveBeenCalledWith({ key: 'a.rupea', to: 'b.rupea' });
		expect(onopen).toHaveBeenCalledWith('b.rupea');
	});

	it('deletes only once confirmed', async () => {
		const { user, api, onremoved } = await rendered();
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await user.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(api.remove).not.toHaveBeenCalled();

		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		expect(api.remove).toHaveBeenCalledWith('a.rupea');
		expect(onremoved).toHaveBeenCalled();
	});

	it('creates a file when none is open', async () => {
		const { user, api, onopen } = await rendered(null);
		await user.click(screen.getByRole('button', { name: 'New file' }));
		await user.clear(screen.getByLabelText('New file'));
		await user.type(screen.getByLabelText('New file'), 'b.rupea');
		await user.click(screen.getByRole('button', { name: 'Create' }));

		expect(api.create).toHaveBeenCalledWith({ key: 'b.rupea', content: '' });
		expect(onopen).toHaveBeenCalledWith('b.rupea');
	});

	it('marks the line a parse error points at', async () => {
		const { editor } = await rendered();
		editor.edit('one\nbad');

		await waitFor(() => expect(document.querySelectorAll('.cm-problem')).toHaveLength(1));
		expect(document.querySelector('.cm-problem')?.textContent).toBe('bad');
	});
});
