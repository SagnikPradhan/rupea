import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listFiles } from '#lib/endpoints/files.remote.ts';
import {
	dismissSuggestion,
	linkGroups,
	listSuggestions,
} from '#lib/endpoints/refinement.remote.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { goto } from '#tests/shared/app-navigation.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/refine/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/files.remote.ts', () => ({ listFiles: vi.fn() }));
vi.mock('#lib/endpoints/refinement.remote.ts', () => ({
	listSuggestions: vi.fn(),
	linkGroups: vi.fn(),
	dismissSuggestion: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const side = (file: string, description: string) => ({
	file,
	line: 1,
	date: '2026-10-03',
	time: null,
	description,
	postings: [{ account: 'Assets:IBKR', quantity: '1000.00' }],
});

const transfer = {
	fingerprint: 'a'.repeat(64),
	confidence: 'duplicate',
	group: 'transfer-otter',
	ours: side('ibkr.rupea', 'Deposit'),
	theirs: side('hdfc.rupea', 'NEFT TO INTERACTIVE BROKERS'),
	links: [
		{ file: 'ibkr.rupea', line: 1, date: '2026-10-03', description: 'Deposit', role: 'primary' },
		{
			file: 'hdfc.rupea',
			line: 1,
			date: '2026-10-03',
			description: 'NEFT TO INTERACTIVE BROKERS',
			role: 'evidence',
		},
	],
};

const showing = (suggestions: unknown[], errors: RupeaError[] = []) => {
	vi.mocked(listFiles).mockReturnValue(answer([{ key: 'hdfc.rupea' }, { key: 'ibkr.rupea' }]));
	vi.mocked(listSuggestions).mockReturnValue(answer(suggestions, errors));
	vi.mocked(linkGroups).mockResolvedValue({ ok: true, data: [], errors: [] });
	vi.mocked(dismissSuggestion).mockResolvedValue({ ok: true, data: undefined, errors: [] });
};

describe('the refine page', () => {
	it('opens the file chosen to find matches for', async () => {
		visit('/l/h/refine');
		showing([]);
		render(Page, { data });

		await fireEvent.change(await screen.findByRole('combobox'), {
			target: { value: 'hdfc.rupea' },
		});
		expect(goto).toHaveBeenCalledWith('?file=hdfc.rupea');
		expect(listSuggestions).not.toHaveBeenCalled();
	});

	it('says when a file has no matches', async () => {
		visit('/l/h/refine?file=hdfc.rupea');
		showing([]);
		render(Page, { data });

		expect(await screen.findByText('No possible matches for hdfc.rupea.')).toBeTruthy();
	});

	it('shows the link each side would get, and swaps the primary', async () => {
		visit('/l/h/refine?file=ibkr.rupea');
		showing([transfer]);
		render(Page, { data });

		const match = await screen.findByRole('article', { name: 'Match ibkr.rupea:1' });
		expect(match.textContent).toContain('- group: transfer-otter');

		await fireEvent.click(screen.getByRole('button', { name: 'Swap primary' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
		expect(linkGroups).toHaveBeenCalledWith({
			handle: 'h',
			edits: [
				expect.objectContaining({ file: 'ibkr.rupea', role: 'evidence', group: 'transfer-otter' }),
				expect.objectContaining({ file: 'hdfc.rupea', role: 'primary', group: 'transfer-otter' }),
			],
		});
	});

	it('accepts every duplicate at once, and dismisses one', async () => {
		visit('/l/h/refine?file=ibkr.rupea');
		showing([transfer]);
		render(Page, { data });

		await fireEvent.click(await screen.findByRole('button', { name: 'Accept all 1 duplicates' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(linkGroups).toHaveBeenCalledOnce();
		expect(dismissSuggestion).toHaveBeenCalledWith({
			handle: 'h',
			file: 'ibkr.rupea',
			fingerprint: transfer.fingerprint,
		});
	});

	it('reports what went wrong listing the matches', async () => {
		visit('/l/h/refine?file=ibkr.rupea');
		showing([], [fault('GroupStale', { location: 'ibkr.rupea' })]);
		render(Page, { data });

		expect((await screen.findByRole('alert')).textContent).toBe('GroupStale at ibkr.rupea');
	});
});
