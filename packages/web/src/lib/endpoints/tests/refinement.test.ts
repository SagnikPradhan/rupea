import { ORPCError } from '@orpc/client';
import { listFiles } from '#lib/endpoints/files.remote.ts';
import { listProblems } from '#lib/endpoints/ledger.remote.ts';
import {
	dismissSuggestion,
	linkGroups,
	listGroups,
	listSuggestions,
	makePrimary,
	renameGroup,
} from '#lib/endpoints/refinement.remote.ts';
import { refreshed, useApi } from '#tests/shared/app-server.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const stale = { type: 'GroupStale', location: 'hdfc.rupea:1' } as const;
const none = { succeeded: [], failed: [] };

describe('suggested groups', () => {
	it('link the files of every edit, then refresh what the links change', async () => {
		const linked = vi.fn().mockResolvedValue(none);
		useApi({ refinement: { linkGroups: linked } });
		const edit = (file: string, line: number) => ({
			file,
			line,
			date: '2026-10-03',
			description: 'Transfer',
			role: 'primary' as const,
			group: 'transfer',
		});
		const edits = [edit('hdfc.rupea', 1), edit('ibkr.rupea', 1), edit('ibkr.rupea', 4)];

		expect(await linkGroups({ handle: 'home', edits })).toEqual({ ok: true, data: [], errors: [] });

		expect(linked).toHaveBeenCalledWith({ handle: 'home', edits });
		expect(refreshed()).toEqual([
			{ remote: listFiles, input: 'home' },
			{ remote: listProblems, input: 'home' },
			{ remote: listSuggestions, input: { handle: 'home', file: 'hdfc.rupea' } },
			{ remote: listSuggestions, input: { handle: 'home', file: 'ibkr.rupea' } },
		]);
	});

	it('answer what stopped a link as a failure', async () => {
		useApi({
			refinement: { linkGroups: () => Promise.resolve({ succeeded: [], failed: [stale] }) },
		});
		const edit = {
			file: 'a.rupea',
			line: 1,
			date: '2026-10-03',
			description: 'Transfer',
			role: 'primary' as const,
			group: 'transfer',
		};

		const linked = await linkGroups({ handle: 'home', edits: [edit] });

		expect(linked).toEqual({ ok: false, data: [], errors: [stale] });
	});

	it('are listed with both sides printed for the page', async () => {
		const side = (time: string | null) => ({
			file: 'a.rupea',
			line: 1,
			date: '2026-10-03',
			time,
			description: 'Transfer',
			comment: null,
			postings: [],
		});
		const suggestion = {
			fingerprint: 'f'.repeat(64),
			confidence: 'possible' as const,
			group: null,
			ours: side('09:30:00'),
			theirs: side(null),
			links: [],
		};
		useApi({ refinement: { listSuggestions: () => Promise.resolve([suggestion]) } });

		const listed = await listSuggestions({ handle: 'home', file: 'a.rupea' });

		expect(listed.data?.[0]).toMatchObject({ ours: { time: '09:30' }, theirs: { time: null } });
	});

	it('are dismissed by fingerprint alone, then listed again for the file', async () => {
		const dismissed = vi.fn().mockResolvedValue(undefined);
		useApi({ refinement: { dismissSuggestion: dismissed } });
		const fingerprint = 'a'.repeat(64);

		const reply = await dismissSuggestion({ handle: 'home', file: 'hdfc.rupea', fingerprint });

		expect(dismissed).toHaveBeenCalledWith({ handle: 'home', fingerprint });
		expect(reply.ok).toBe(true);
		expect(refreshed()).toEqual([
			{ remote: listSuggestions, input: { handle: 'home', file: 'hdfc.rupea' } },
		]);
	});

	it('refuse a fingerprint that is not one', async () => {
		useApi({});

		await expect(
			dismissSuggestion({ handle: 'home', file: 'a.rupea', fingerprint: 'abc' }),
		).rejects.toThrow('Invalid input');
	});
});

describe('a group', () => {
	it('is renamed without the file, then the file lists it again', async () => {
		const renamed = vi.fn().mockResolvedValue(none);
		useApi({ refinement: { renameGroup: renamed } });

		const reply = await renameGroup({ handle: 'home', file: 'a.rupea', group: 'old', to: 'new' });

		expect(renamed).toHaveBeenCalledWith({ handle: 'home', group: 'old', to: 'new' });
		expect(reply.ok).toBe(true);
		expect(refreshed()).toEqual([
			{ remote: listFiles, input: 'home' },
			{ remote: listProblems, input: 'home' },
			{ remote: listGroups, input: { handle: 'home', file: 'a.rupea' } },
		]);
	});

	it('is refused as a failure when the rename leaves it stale', async () => {
		useApi({
			refinement: { renameGroup: () => Promise.resolve({ succeeded: [], failed: [stale] }) },
		});

		const reply = await renameGroup({ handle: 'home', file: 'a.rupea', group: 'old', to: 'new' });

		expect(reply).toEqual({ ok: false, data: [], errors: [stale] });
	});

	it('is given a new primary by its member, without the file of the page', async () => {
		const made = vi.fn().mockResolvedValue(none);
		useApi({ refinement: { makePrimary: made } });
		const member = { file: 'hdfc.rupea', line: 1 };

		await makePrimary({ handle: 'home', file: 'ibkr.rupea', group: 'transfer', member });

		expect(made).toHaveBeenCalledWith({ handle: 'home', group: 'transfer', ...member });
		expect(refreshed()).toContainEqual({
			remote: listGroups,
			input: { handle: 'home', file: 'ibkr.rupea' },
		});
	});

	it('lists its members as the page shows them', async () => {
		const member = {
			role: 'primary' as const,
			counted: true,
			file: 'a.rupea',
			line: 1,
			date: '2026-10-03',
			time: '18:45:30',
			description: 'Transfer',
			comment: null,
			postings: [],
		};
		useApi({
			refinement: { listGroups: () => Promise.resolve([{ group: 'transfer', members: [member] }]) },
		});

		const listed = await listGroups({ handle: 'home', file: 'a.rupea' });

		expect(listed.data?.[0]?.members[0]).toMatchObject({ role: 'primary', time: '18:45' });
	});

	it('answers a ledger that is not found as the failure it was refused with', async () => {
		const missing = { type: 'LedgerNotFound', handle: 'gone' } as const;
		const refused = new ORPCError('MISSING', { status: 404, defined: true, data: missing });
		useApi({ refinement: { listGroups: () => Promise.reject(refused) } });

		const listed = await listGroups({ handle: 'gone', file: 'a.rupea' });

		expect(listed).toEqual({ ok: false, data: null, errors: [missing] });
	});

	it('refuses a group id of more than one word', async () => {
		useApi({});

		await expect(
			renameGroup({ handle: 'home', file: 'a.rupea', group: 'a', to: 'two words' }),
		).rejects.toThrow('Invalid input');
	});
});
