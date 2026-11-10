import { bearerOf } from '@rupea/server/tests/shared/api.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createApi } from '../api/api.ts';

const hdfc = '2026-10-03 NEFT TO INTERACTIVE BROKERS\n\tAssets:HDFC -1000\n\tAssets:IBKR\n';
const ibkr = '2026-10-03 Deposit\n\tAssets:IBKR 1000\n\tAssets:HDFC\n';

const seeded = async (context: Parameters<typeof createApi>[0]) => {
	const ledger = await createLedger(context.db);
	await Files.createFile({ ledger, key: 'hdfc.rupea', content: hdfc });
	await Files.createFile({ ledger, key: 'ibkr.rupea', content: ibkr });
	const api = await createApi(context);
	const headers = await bearerOf(ledger.owner);
	const url = `/api/ledgers/${ledger.handle}`;
	const [suggestion] = (
		await api.inject({ url: `${url}/suggestions?file=ibkr.rupea`, headers })
	).json();
	const link = () =>
		api.inject({
			method: 'POST',
			url: `${url}/links`,
			headers,
			payload: { edits: suggestion.links.map((l: object) => ({ ...l, group: suggestion.group })) },
		});

	return { url, api, headers, suggestion, link };
};

describe('the refinement api', () => {
	it('suggests a group across files with both sides and the links to write', ({ context }) =>
		provide(context, async () => {
			const { suggestion } = await seeded(context);

			expect(suggestion).toEqual({
				fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
				confidence: 'possible',
				group: expect.stringMatching(/^2026-10-03-deposit-/),
				ours: expect.objectContaining({ file: 'ibkr.rupea', line: 1, description: 'Deposit' }),
				theirs: expect.objectContaining({ file: 'hdfc.rupea', date: '2026-10-03' }),
				links: [
					{
						file: 'ibkr.rupea',
						line: 1,
						date: '2026-10-03',
						description: 'Deposit',
						role: 'primary',
					},
					{
						file: 'hdfc.rupea',
						line: 1,
						date: '2026-10-03',
						description: 'NEFT TO INTERACTIVE BROKERS',
						role: 'evidence',
					},
				],
			});
		}));

	it('links a group, then lists it with the member that counts', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers, suggestion, link } = await seeded(context);

			const linked = await link();
			const listed = await api.inject({ url: `${url}/groups?file=ibkr.rupea`, headers });
			const again = await api.inject({ url: `${url}/suggestions?file=ibkr.rupea`, headers });

			expect(linked.statusCode).toBe(200);
			expect(linked.json()).toEqual({ succeeded: [], failed: [] });
			expect(listed.json()).toEqual([
				{
					group: suggestion.group,
					members: expect.arrayContaining([
						expect.objectContaining({ role: 'primary', counted: true, file: 'ibkr.rupea' }),
						expect.objectContaining({ role: 'evidence', counted: false, file: 'hdfc.rupea' }),
					]),
				},
			]);
			expect(again.json()).toEqual([]);
		}));

	it('reports a link whose header changed as failed, with a 200', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers, suggestion } = await seeded(context);
			const [first, ...rest] = suggestion.links;

			const reply = await api.inject({
				method: 'POST',
				url: `${url}/links`,
				headers,
				payload: {
					edits: [
						{ ...first, description: 'Else', group: suggestion.group },
						...rest.map((l: object) => ({ ...l, group: suggestion.group })),
					],
				},
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({
				succeeded: [],
				failed: [{ type: 'GroupStale', location: expect.stringContaining('ibkr.rupea') }],
			});
		}));

	it('refuses to link nothing or past the most edits, a group of two words or a role it does not know', ({
		context,
	}) =>
		provide(context, async () => {
			const { api, url, headers, suggestion } = await seeded(context);
			const [first] = suggestion.links;
			const link = (edits: object[]) =>
				api.inject({ method: 'POST', url: `${url}/links`, headers, payload: { edits } });

			const replies = await Promise.all([
				link([]),
				link(Array.from({ length: 10_001 }, () => ({ ...first, group: 'one' }))),
				link([{ ...first, group: 'two words' }]),
				link([{ ...first, role: 'boss', group: 'one' }]),
			]);

			expect(replies.map((r) => r.statusCode)).toEqual([400, 400, 400, 400]);
		}));

	it('makes another member the primary, which then counts', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers, suggestion, link } = await seeded(context);
			await link();

			const made = await api.inject({
				method: 'PUT',
				url: `${url}/groups/${suggestion.group}/primary`,
				headers,
				payload: { file: 'hdfc.rupea', line: 1 },
			});
			const listed = await api.inject({ url: `${url}/groups?file=ibkr.rupea`, headers });
			const stale = await api.inject({
				method: 'PUT',
				url: `${url}/groups/${suggestion.group}/primary`,
				headers,
				payload: { file: 'hdfc.rupea', line: 9 },
			});

			expect(made.json()).toEqual({ succeeded: [], failed: [] });
			expect(
				listed.json()[0].members.map((m: { file: string; role: string }) => [m.file, m.role]),
			).toEqual(
				expect.arrayContaining([
					['ibkr.rupea', 'evidence'],
					['hdfc.rupea', 'primary'],
				]),
			);
			expect(stale.statusCode).toBe(422);
			expect(stale.json()).toMatchObject({ data: { type: 'GroupStale' } });
		}));

	it('renames a group, and answers 409 for a name that is taken', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers, suggestion, link } = await seeded(context);
			await link();
			const rename = (group: string, to: string) =>
				api.inject({ method: 'PATCH', url: `${url}/groups/${group}`, headers, payload: { to } });

			const renamed = await rename(suggestion.group, 'transfer');
			const taken = await rename('transfer', 'transfer');
			const listed = await api.inject({ url: `${url}/groups?file=ibkr.rupea`, headers });

			expect(renamed.json()).toEqual({ succeeded: [], failed: [] });
			expect(taken.statusCode).toBe(409);
			expect(taken.json()).toMatchObject({ data: { type: 'GroupIdTaken', group: 'transfer' } });
			expect(listed.json().map((g: { group: string }) => g.group)).toEqual(['transfer']);
		}));

	it('dismisses a suggestion for good, however often it is asked', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers, suggestion } = await seeded(context);
			const dismiss = (fingerprint: string) =>
				api.inject({ method: 'PUT', url: `${url}/dismissals/${fingerprint}`, headers });

			const first = await dismiss(suggestion.fingerprint);
			const second = await dismiss(suggestion.fingerprint);
			const bad = await dismiss('nope');
			const listed = await api.inject({ url: `${url}/suggestions?file=ibkr.rupea`, headers });

			expect([first.statusCode, second.statusCode, bad.statusCode]).toEqual([200, 200, 400]);
			expect(listed.json()).toEqual([]);
		}));
});
