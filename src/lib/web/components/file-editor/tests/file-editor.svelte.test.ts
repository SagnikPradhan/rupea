import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditor } from '#lib/web/components/file-editor/file-editor.svelte.ts';
import { fakeApi, parseError } from '#lib/web/components/file-editor/tests/fixture.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const opened = async (files: Record<string, string> = { 'a.rupee': 'one' }) => {
	const fake = fakeApi(files);
	const editor = createEditor(fake.api, 300);
	await editor.open('a.rupee');
	return { ...fake, editor };
};

describe('opening a file', () => {
	it('shows its content and checks it', async () => {
		const { editor, api } = await opened();
		expect(editor.state.content).toBe('one');
		expect(editor.dirty).toBe(false);
		expect(api.check).toHaveBeenCalledWith({ key: 'a.rupee', content: 'one' });
	});

	it('reports a file that cannot be read', async () => {
		const { editor } = await opened({});
		expect(editor.state.file).toBeNull();
	});
});

describe('editing', () => {
	it('is dirty until saved, and checks once typing pauses', async () => {
		const { editor, api } = await opened();
		api.check.mockClear();

		editor.edit('bad');
		editor.edit('bad 2');
		expect(editor.dirty).toBe(true);
		await vi.advanceTimersByTimeAsync(299);
		expect(api.check).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(api.check).toHaveBeenCalledTimes(1);
		expect(editor.state.errors.parse).toEqual([parseError]);
	});

	it('saves even with parse errors', async () => {
		const { editor, disk } = await opened();
		editor.edit('bad');
		await editor.save();
		expect(disk.get('a.rupee')?.content).toBe('bad');
		expect(editor.dirty).toBe(false);
	});
});

describe('a conflict', () => {
	const conflicted = async () => {
		const opening = await opened();
		opening.touch('a.rupee', 'elsewhere');
		opening.editor.edit('mine');
		await opening.editor.save();
		return opening;
	};

	it('is raised when the file changed on disk, keeping the edit', async () => {
		const { editor } = await conflicted();
		expect(editor.state.conflict).toBe(true);
		expect(editor.state.content).toBe('mine');
	});

	it('is resolved by reloading', async () => {
		const { editor } = await conflicted();
		await editor.reload();
		expect(editor.state.conflict).toBe(false);
		expect(editor.state.content).toBe('elsewhere');
	});

	it('is resolved by overwriting', async () => {
		const { editor, disk } = await conflicted();
		await editor.overwrite();
		expect(editor.state.conflict).toBe(false);
		expect(disk.get('a.rupee')?.content).toBe('mine');
	});
});

describe('file operations', () => {
	it('creates an empty file and opens it', async () => {
		const { editor, disk } = await opened();
		expect(await editor.create('b.rupee')).toBe(true);
		expect(disk.get('b.rupee')?.content).toBe('');
		expect(editor.state.file?.key).toBe('b.rupee');
	});

	it('renames the open file', async () => {
		const { editor, disk } = await opened();
		expect(await editor.rename('b.rupee')).toBe(true);
		expect([...disk.keys()]).toEqual(['b.rupee']);
		expect(editor.state.file?.key).toBe('b.rupee');
	});

	it('deletes the open file and closes it', async () => {
		const { editor, disk } = await opened();
		expect(await editor.remove()).toBe(true);
		expect(disk.size).toBe(0);
		expect(editor.state.file).toBeNull();
	});
});
