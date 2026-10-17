import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createEditor } from '#lib/web/components/file-editor/file-editor.svelte.ts';
import FileEditor from '#lib/web/components/file-editor/file-editor.svelte';
import { fakeApi } from '#lib/web/components/file-editor/tests/fixture.ts';

const rendered = async () => {
	const fake = fakeApi({ 'a.rupee': 'one' });
	const editor = createEditor(fake.api, 0);
	await editor.open('a.rupee');
	const onopen = vi.fn();
	const onremoved = vi.fn();
	render(FileEditor, { handle: 'h', editor, line: null, onopen, onremoved });
	return { ...fake, editor, onopen, onremoved, user: userEvent.setup() };
};

describe('the file editor', () => {
	it('offers Reload and Overwrite on a conflict, and Overwrite re-saves', async () => {
		const { user, editor, touch, disk } = await rendered();
		touch('a.rupee', 'elsewhere');
		editor.edit('one mine');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		expect(screen.getByText(/changed on disk/)).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Overwrite' }));

		expect(disk.get('a.rupee')?.content).toBe('one mine');
		expect(screen.queryByText(/changed on disk/)).toBeNull();
	});

	it('renames through the rename remote', async () => {
		const { user, api, onopen } = await rendered();
		await user.click(screen.getByRole('button', { name: 'Rename' }));
		await user.clear(screen.getByLabelText('Rename to'));
		await user.type(screen.getByLabelText('Rename to'), 'b.rupee');
		await user.click(screen.getByRole('button', { name: 'Rename' }));

		expect(api.rename).toHaveBeenCalledWith({ key: 'a.rupee', to: 'b.rupee' });
		expect(onopen).toHaveBeenCalledWith('b.rupee');
	});

	it('deletes only once confirmed', async () => {
		const { user, api, onremoved } = await rendered();
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await user.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(api.remove).not.toHaveBeenCalled();

		await user.click(screen.getByRole('button', { name: 'Delete' }));
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		expect(api.remove).toHaveBeenCalledWith('a.rupee');
		expect(onremoved).toHaveBeenCalled();
	});
});
