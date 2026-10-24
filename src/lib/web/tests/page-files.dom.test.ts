import { EditorView } from '@codemirror/view';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	editFile,
	formatFile,
	listFiles,
	parseFile,
	readFile,
} from '#lib/endpoints/files.remote.ts';
import { listEvents, listSuggestions } from '#lib/endpoints/refinement.remote.ts';
import { beforeNavigate, goto } from '#tests/shared/app-navigation.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/files/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/files.remote.ts', () => ({
	createFile: vi.fn(),
	deleteFiles: vi.fn(),
	editFile: vi.fn(),
	formatFile: vi.fn(),
	listFiles: vi.fn(),
	parseFile: vi.fn(),
	readFile: vi.fn(),
	renameFiles: vi.fn(),
}));
vi.mock('#lib/endpoints/refinement.remote.ts', () => ({
	listEvents: vi.fn(),
	listSuggestions: vi.fn(),
	makePrimary: vi.fn(),
	renameEvent: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const bank = {
	key: 'bank.rupee',
	content: 'one',
	version: '1',
	size: 3,
	modified: new Date('2026-10-01'),
};

const showing = (path: string) => {
	visit(path);
	vi.mocked(listFiles).mockReturnValue(answer([]));
	vi.mocked(listEvents).mockReturnValue(answer([]));
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
	render(Page, { data });
	return userEvent.setup();
};

const leaving = () => {
	const cancel = vi.fn();
	const guard = vi.mocked(beforeNavigate).mock.calls[0]?.[0];
	guard?.({ willUnload: false, cancel } as never);
	return cancel;
};

describe('the files page', () => {
	it('lists the files when none is open', async () => {
		showing('/l/h/files');

		expect(await screen.findByText('No files yet.')).toBeTruthy();
		expect(readFile).not.toHaveBeenCalled();
		expect(leaving()).not.toHaveBeenCalled();
	});

	it('opens the chosen file, and offers to find its matches', async () => {
		showing('/l/h/files?file=bank.rupee');

		await waitFor(() => expect(readFile).toHaveBeenCalledWith({ handle: 'h', key: 'bank.rupee' }));
		expect((await screen.findByRole('link', { name: 'Find matches' })).getAttribute('href')).toBe(
			'/l/h/refine?file=bank.rupee',
		);
		expect(screen.getByRole('link', { name: 'Files' }).getAttribute('href')).toBe('/l/h/files');
	});

	it('counts the matches a save turned up, and holds navigation while unsaved', async () => {
		const user = showing('/l/h/files?file=bank.rupee');
		await screen.findByRole('link', { name: 'Find matches' });
		const view = EditorView.findFromDOM(screen.getByRole('textbox'));
		view?.dispatch({ changes: { from: 3, insert: ' two' } });

		vi.stubGlobal('confirm', () => false);
		expect(leaving()).toHaveBeenCalled();
		vi.unstubAllGlobals();

		await user.click(screen.getByRole('button', { name: 'Save' }));
		expect(await screen.findByRole('link', { name: '2 possible matches: review' })).toBeTruthy();
		expect(listSuggestions).toHaveBeenCalledWith({ handle: 'h', file: 'bank.rupee' });
		expect(goto).not.toHaveBeenCalled();
	});
});
