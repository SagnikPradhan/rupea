import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listFiles } from '#lib/endpoints/files.remote.ts';
import {
	dismissSuggestion,
	linkEvents,
	listSuggestions,
} from '#lib/endpoints/refinement.remote.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { goto } from '#tests/shared/app-navigation.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '../+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/files.remote.ts', () => ({ listFiles: vi.fn() }));
vi.mock('#lib/endpoints/refinement.remote.ts', () => ({
	listSuggestions: vi.fn(),
	linkEvents: vi.fn(),
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
	event: 'transfer-otter',
	ours: side('ibkr.rupee', 'Deposit'),
	theirs: side('hdfc.rupee', 'NEFT TO INTERACTIVE BROKERS'),
	links: [
		{ file: 'ibkr.rupee', line: 1, date: '2026-10-03', description: 'Deposit', role: 'primary' },
		{
			file: 'hdfc.rupee',
			line: 1,
			date: '2026-10-03',
			description: 'NEFT TO INTERACTIVE BROKERS',
			role: 'evidence',
		},
	],
};

const showing = (suggestions: unknown[], errors: RupeeError[] = []) => {
	vi.mocked(listFiles).mockReturnValue(answer([{ key: 'hdfc.rupee' }, { key: 'ibkr.rupee' }]));
	vi.mocked(listSuggestions).mockReturnValue(answer(suggestions, errors));
	vi.mocked(linkEvents).mockResolvedValue({ ok: true, data: [], errors: [] });
	vi.mocked(dismissSuggestion).mockResolvedValue({ ok: true, data: undefined, errors: [] });
};

describe('the refine page', () => {
	it('opens the file chosen to find matches for', async () => {
		visit('/l/h/refine');
		showing([]);
		render(Page, { data });

		await fireEvent.change(await screen.findByRole('combobox'), {
			target: { value: 'hdfc.rupee' },
		});
		expect(goto).toHaveBeenCalledWith('?file=hdfc.rupee');
		expect(listSuggestions).not.toHaveBeenCalled();
	});

	it('says when a file has no matches', async () => {
		visit('/l/h/refine?file=hdfc.rupee');
		showing([]);
		render(Page, { data });

		expect(await screen.findByText('No possible matches for hdfc.rupee.')).toBeTruthy();
	});

	it('shows the link each side would get, and swaps the primary', async () => {
		visit('/l/h/refine?file=ibkr.rupee');
		showing([transfer]);
		render(Page, { data });

		const match = await screen.findByRole('article', { name: 'Match ibkr.rupee:1' });
		expect(match.textContent).toContain('- event: transfer-otter');

		await fireEvent.click(screen.getByRole('button', { name: 'Swap primary' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
		expect(linkEvents).toHaveBeenCalledWith({
			handle: 'h',
			edits: [
				expect.objectContaining({ file: 'ibkr.rupee', role: 'evidence', event: 'transfer-otter' }),
				expect.objectContaining({ file: 'hdfc.rupee', role: 'primary', event: 'transfer-otter' }),
			],
		});
	});

	it('accepts every duplicate at once, and dismisses one', async () => {
		visit('/l/h/refine?file=ibkr.rupee');
		showing([transfer]);
		render(Page, { data });

		await fireEvent.click(await screen.findByRole('button', { name: 'Accept all 1 duplicates' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(linkEvents).toHaveBeenCalledOnce();
		expect(dismissSuggestion).toHaveBeenCalledWith({
			handle: 'h',
			file: 'ibkr.rupee',
			fingerprint: transfer.fingerprint,
		});
	});

	it('reports what went wrong listing the matches', async () => {
		visit('/l/h/refine?file=ibkr.rupee');
		showing([], [fault('EventStale', { location: 'ibkr.rupee' })]);
		render(Page, { data });

		expect((await screen.findByRole('alert')).textContent).toBe('EventStale at ibkr.rupee');
	});
});
