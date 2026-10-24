import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listEvents, makePrimary, renameEvent } from '#lib/endpoints/refinement.remote.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import FileEvents from '#lib/web/components/file-events/file-events.svelte';
import { answer } from '#tests/shared/queries.ts';

vi.mock('#lib/endpoints/refinement.remote.ts', () => ({
	listEvents: vi.fn(),
	makePrimary: vi.fn(),
	renameEvent: vi.fn(),
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
	event: 'transfer-otter',
	members: [member('ibkr.rupee', 'primary', true), member('hdfc.rupee', 'evidence', false)],
};

const rendered = (locked = false) => {
	vi.mocked(listEvents).mockReturnValue(answer([transfer]));
	vi.mocked(renameEvent).mockResolvedValue({ ok: true, data: [], errors: [] });
	vi.mocked(makePrimary).mockResolvedValue({
		ok: true,
		data: [fault('EventStale', { location: 'hdfc.rupee:1' })],
		errors: [],
	});
	const onchanged = vi.fn();
	render(FileEvents, { handle: 'h', file: 'ibkr.rupee', locked, onchanged });
	return { onchanged };
};

describe('the file events', () => {
	it('lists each member, and marks the uncounted', async () => {
		rendered();

		const event = await screen.findByRole('article', { name: 'Event transfer-otter' });
		expect(event.textContent).toContain('Primary:');
		expect(event.textContent).toContain('Evidence, not counted:');
		expect(screen.getAllByRole('button', { name: 'Make primary' })).toHaveLength(1);
	});

	it('renames an event to what was typed, and ignores the same name', async () => {
		const { onchanged } = rendered();
		const prompt = vi.fn().mockReturnValueOnce('transfer-otter');
		vi.stubGlobal('prompt', prompt);
		await fireEvent.click(await screen.findByRole('button', { name: 'Rename event' }));
		expect(renameEvent).not.toHaveBeenCalled();

		prompt.mockReturnValueOnce('salary');
		await fireEvent.click(screen.getByRole('button', { name: 'Rename event' }));
		await waitFor(() => expect(onchanged).toHaveBeenCalled());
		expect(renameEvent).toHaveBeenCalledWith({
			handle: 'h',
			file: 'ibkr.rupee',
			event: 'transfer-otter',
			to: 'salary',
		});
	});

	it('reports the files a new primary could not change', async () => {
		rendered();
		await fireEvent.click(await screen.findByRole('button', { name: 'Make primary' }));

		expect((await screen.findByRole('alert')).textContent).toBe('EventStale at hdfc.rupee:1');
		expect(makePrimary).toHaveBeenCalledWith({
			handle: 'h',
			file: 'ibkr.rupee',
			event: 'transfer-otter',
			member: { file: 'hdfc.rupee', line: 1 },
		});
	});

	it('holds changes while the file has unsaved edits', async () => {
		rendered(true);

		expect(await screen.findByText('Save to change events.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Make primary' })).toHaveProperty('disabled', true);
	});
});
