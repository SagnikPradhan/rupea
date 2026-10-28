import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listGroups, makePrimary, renameGroup } from '#lib/endpoints/refinement.remote.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import FileGroups from '#lib/web/components/file-groups/file-groups.svelte';
import { answer } from '#tests/shared/queries.ts';

vi.mock('#lib/endpoints/refinement.remote.ts', () => ({
	listGroups: vi.fn(),
	makePrimary: vi.fn(),
	renameGroup: vi.fn(),
}));

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

const member = (file: string, role: string, counted: boolean) => ({
	file,
	line: 1,
	date: '2026-10-03',
	description: 'Deposit',
	role,
	counted,
});

const transfer = {
	group: 'transfer-otter',
	members: [member('ibkr.rupea', 'primary', true), member('hdfc.rupea', 'evidence', false)],
};

const rendered = (locked = false) => {
	vi.mocked(listGroups).mockReturnValue(answer([transfer]));
	vi.mocked(renameGroup).mockResolvedValue({ ok: true, data: [], errors: [] });
	vi.mocked(makePrimary).mockResolvedValue({
		ok: true,
		data: [fault('GroupStale', { location: 'hdfc.rupea:1' })],
		errors: [],
	});
	const onchanged = vi.fn();
	render(FileGroups, { handle: 'h', file: 'ibkr.rupea', locked, onchanged });
	return { onchanged };
};

describe('the file groups', () => {
	it('lists each member, and marks the uncounted', async () => {
		rendered();

		const group = await screen.findByRole('article', { name: 'Group transfer-otter' });
		expect(group.textContent).toContain('Primary:');
		expect(group.textContent).toContain('Evidence, not counted:');
		expect(screen.getAllByRole('button', { name: 'Make primary' })).toHaveLength(1);
	});

	it('renames a group to what was typed, and ignores the same name', async () => {
		const { onchanged } = rendered();
		const prompt = vi.fn().mockReturnValueOnce('transfer-otter');
		vi.stubGlobal('prompt', prompt);
		await fireEvent.click(await screen.findByRole('button', { name: 'Rename group' }));
		expect(renameGroup).not.toHaveBeenCalled();

		prompt.mockReturnValueOnce('salary');
		await fireEvent.click(screen.getByRole('button', { name: 'Rename group' }));
		await waitFor(() => expect(onchanged).toHaveBeenCalled());
		expect(renameGroup).toHaveBeenCalledWith({
			handle: 'h',
			file: 'ibkr.rupea',
			group: 'transfer-otter',
			to: 'salary',
		});
	});

	it('reports the files a new primary could not change', async () => {
		rendered();
		await fireEvent.click(await screen.findByRole('button', { name: 'Make primary' }));

		expect((await screen.findByRole('alert')).textContent).toBe('GroupStale at hdfc.rupea:1');
		expect(makePrimary).toHaveBeenCalledWith({
			handle: 'h',
			file: 'ibkr.rupea',
			group: 'transfer-otter',
			member: { file: 'hdfc.rupea', line: 1 },
		});
	});

	it('holds changes while the file has unsaved edits', async () => {
		rendered(true);

		expect(await screen.findByText('Save to change groups.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Make primary' })).toHaveProperty('disabled', true);
	});
});
