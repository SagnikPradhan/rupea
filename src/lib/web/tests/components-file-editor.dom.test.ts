import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditor } from '#lib/editor/editor.svelte.ts';
import FileEditor from '#lib/web/components/file-editor.svelte';
import { fakeApi } from '#lib/editor/fixture.ts';

afterEach(() => vi.unstubAllGlobals());

const rendered = async () => {
	const fake = fakeApi({ 'a.rupee': 'one' });
	const editor = createEditor(fake.api, 0);
	await editor.open('a.rupee');
	const onrenamed = vi.fn();
	const onremoved = vi.fn();
	render(FileEditor, { editor, onrenamed, onremoved });
	return { ...fake, editor, onrenamed, onremoved, user: userEvent.setup() };
};

describe('the file editor', () => {
	it('offers Reload and Overwrite on a conflict, and Overwrite re-saves', async () => {
		const { user, touch, disk } = await rendered();
		touch('a.rupee', 'elsewhere');
		await user.type(screen.getByLabelText('Ledger file'), ' mine');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		expect(screen.getByText(/changed on disk/)).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Overwrite' }));

		expect(disk.get('a.rupee')?.content).toBe('one mine');
		expect(screen.queryByText(/changed on disk/)).toBeNull();
	});

	it('renames through the rename remote', async () => {
		const { user, api, onrenamed } = await rendered();
		vi.stubGlobal('prompt', () => 'b.rupee');
		await user.click(screen.getByRole('button', { name: 'Rename' }));

		expect(api.rename).toHaveBeenCalledWith({ key: 'a.rupee', to: 'b.rupee' });
		expect(onrenamed).toHaveBeenCalledWith('b.rupee');
	});

	it('deletes only once confirmed', async () => {
		const { user, api, onremoved } = await rendered();
		vi.stubGlobal('confirm', () => false);
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		expect(api.remove).not.toHaveBeenCalled();

		vi.stubGlobal('confirm', () => true);
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		expect(api.remove).toHaveBeenCalledWith('a.rupee');
		expect(onremoved).toHaveBeenCalled();
	});
});
