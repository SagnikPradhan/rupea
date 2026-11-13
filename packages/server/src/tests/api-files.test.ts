import { bearerOf } from '@rupea/server/tests/shared/api.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { openFolder } from '#services/ledger/application/ledger.ts';
import { createApi } from '../api/api.ts';

const salary = '2026-10-01 Salary\n\tAssets:Bank 100000\n\tIncome:Salary\n';

const form = {
	file: 'a.rupea',
	date: '2026-10-05',
	time: '',
	description: 'Tea',
	comment: '',
	metadata: [],
	postings: [
		{
			account: 'Expenses:Food',
			amount: '20',
			commodity: '',
			price: '',
			total: false,
			cost: '',
			costDate: '',
			balance: '',
			comment: '',
			metadata: [],
		},
		{
			account: 'Assets:Bank',
			amount: '',
			commodity: '',
			price: '',
			total: false,
			cost: '',
			costDate: '',
			balance: '',
			comment: '',
			metadata: [],
		},
	],
};

const seeded = async (context: Parameters<typeof createApi>[0]) => {
	const ledger = await createLedger(context.db);
	await Files.createFile({ ledger, key: 'a.rupea', content: salary });
	const api = await createApi(context);
	const headers = await bearerOf(ledger.owner);

	return { ledger, url: `/api/ledgers/${ledger.handle}`, api, headers };
};

describe('the files api', () => {
	it('lists files without their text, with the time they changed as a timestamp', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({ url: `${url}/files`, headers });

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual([
				{
					key: 'a.rupea',
					size: salary.length,
					modified: expect.stringMatching(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/),
					version: expect.any(String),
				},
			]);
		}));

	it('reads a file with its text, and answers 404 when one is not there', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const found = await api.inject({ url: `${url}/files/content?key=a.rupea`, headers });
			const missing = await api.inject({ url: `${url}/files/content?key=b.rupea`, headers });

			expect(found.json()).toMatchObject({ key: 'a.rupea', content: salary });
			expect(missing.statusCode).toBe(404);
			expect(missing.json()).toMatchObject({
				data: { type: 'StorageNotFound', key: 'b.rupea' },
			});
		}));

	it('refuses a key that is not a ledger file', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({ url: `${url}/files/content?key=a.txt`, headers });

			expect(reply.statusCode).toBe(400);
		}));

	it.for(['../x.rupea', 'a/../x.rupea', 'a//b.rupea', '/x.rupea', 'a/./b.rupea', 'a\\b.rupea'])(
		'refuses the key %s, which could leave the ledger or name nothing',
		(key, { context }) =>
			provide(context, async () => {
				const { api, url, headers } = await seeded(context);

				const reply = await api.inject({
					method: 'POST',
					url: `${url}/files`,
					headers,
					payload: { key, content: salary },
				});

				expect(reply.statusCode).toBe(400);
			}),
	);

	it('refuses a key with a NUL or a segment past 255 characters', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const create = (key: string) =>
				api.inject({ method: 'POST', url: `${url}/files`, headers, payload: { key, content: '' } });

			expect((await create('a\0b.rupea')).statusCode).toBe(400);
			expect((await create(`${'a'.repeat(256)}.rupea`)).statusCode).toBe(400);
			expect((await create(`${'a'.repeat(249)}.rupea`)).statusCode).toBe(200);
		}));

	it('creates a file, then answers 409 for the same key', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const payload = { key: 'b.rupea', content: salary };

			const first = await api.inject({ method: 'POST', url: `${url}/files`, headers, payload });
			const second = await api.inject({ method: 'POST', url: `${url}/files`, headers, payload });

			expect(first.json()).toMatchObject({ key: 'b.rupea', content: salary });
			expect(second.statusCode).toBe(409);
			expect(second.json()).toMatchObject({ data: { type: 'StorageConflict', key: 'b.rupea' } });
		}));

	it('edits a file only from the version it was read as', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const read = await api.inject({ url: `${url}/files/content?key=a.rupea`, headers });
			const version = read.json().version;
			const edit = (v: string, content: string) =>
				api.inject({
					method: 'PUT',
					url: `${url}/files`,
					headers,
					payload: { key: 'a.rupea', content, version: v },
				});

			const edited = await edit(version, `${salary}\n`);
			const stale = await edit(version, 'changed');

			expect(edited.statusCode).toBe(200);
			expect(edited.json().content).toBe(`${salary}\n`);
			expect(stale.statusCode).toBe(409);
		}));

	it('refuses text past the most a file holds', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				method: 'POST',
				url: `${url}/files`,
				headers,
				payload: { key: 'big.rupea', content: 'a'.repeat(16 * 1024 * 1024 + 1) },
			});

			expect(reply.statusCode).toBe(400);
		}));

	it('refuses a draft past the most that is formatted or parsed on the spot', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const content = 'a'.repeat(1024 * 1024 + 1);
			const post = (path: string) =>
				api.inject({
					method: 'POST',
					url: `${url}/files/${path}`,
					headers,
					payload: { key: 'a.rupea', content },
				});

			expect((await post('format')).statusCode).toBe(400);
			expect((await post('parse')).statusCode).toBe(400);
		}));

	it('formats a draft without saving it', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				method: 'POST',
				url: `${url}/files/format`,
				headers,
				payload: { content: '2026-10-01   Salary\n  Assets:Bank   100\n  Income:Salary\n' },
			});
			const read = await api.inject({ url: `${url}/files/content?key=a.rupea`, headers });

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toBe('2026-10-01 Salary\n\tAssets:Bank    100.00\n\tIncome:Salary\n');
			expect(read.json().content).toBe(salary);
		}));

	it('parses a draft into transactions beside the lines that did not read', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				method: 'POST',
				url: `${url}/files/parse`,
				headers,
				payload: { key: 'd.rupea', content: `${salary}\n2026-10-02 Broken\n\tAssets:Bank 5\n` },
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({
				succeeded: [
					{
						file: 'd.rupea',
						line: 1,
						date: '2026-10-01',
						time: null,
						description: 'Salary',
						comment: null,
						postings: [
							{
								account: 'Assets:Bank',
								quantity: { amount: '100000.00', commodity: 'INR', price: null, cost: null },
							},
							{
								account: 'Income:Salary',
								quantity: { amount: '-100000.00', commodity: 'INR', price: null, cost: null },
							},
						],
					},
				],
				failed: [{ type: 'ParseMissingTransactionBody', location: 'd.rupea:5' }],
			});
		}));

	it('renames what it can and reports the files it could not', ({ context }) =>
		provide(context, async () => {
			const { ledger, api, url, headers } = await seeded(context);
			await Files.createFile({ ledger, key: 'b.rupea', content: salary });

			const reply = await api.inject({
				method: 'PATCH',
				url: `${url}/files`,
				headers,
				payload: {
					moves: [
						{ from: 'a.rupea', to: 'b.rupea' },
						{ from: 'b.rupea', to: 'c.rupea' },
					],
				},
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json().succeeded.map((f: { key: string }) => f.key)).toEqual(['c.rupea']);
			expect(reply.json().failed).toHaveLength(1);
		}));

	it('refuses to rename nothing or past the most keys', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const rename = (moves: object[]) =>
				api.inject({ method: 'PATCH', url: `${url}/files`, headers, payload: { moves } });
			const move = { from: 'a.rupea', to: 'b.rupea' };

			const none = await rename([]);
			const many = await rename(Array.from({ length: 1001 }, () => move));

			expect([none.statusCode, many.statusCode]).toEqual([400, 400]);
		}));

	it('deletes the files named in the body', ({ context }) =>
		provide(context, async () => {
			const { ledger, api, url, headers } = await seeded(context);
			await Files.createFile({ ledger, key: 'b.rupea', content: salary });

			const reply = await api.inject({
				method: 'DELETE',
				url: `${url}/files`,
				headers,
				payload: { keys: ['a.rupea', 'b.rupea'] },
			});
			const listed = await api.inject({ url: `${url}/files`, headers });

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({ succeeded: ['a.rupea', 'b.rupea'], failed: [] });
			expect(listed.json()).toEqual([]);
		}));

	it('moves a draft to a new file, and merges it into one that is there', ({ context }) =>
		provide(context, async () => {
			const { ledger, api, url, headers } = await seeded(context);
			await Files.createFile({ ledger, key: 'draft.rupea', content: salary });
			await Files.createFile({ ledger, key: 'draft2.rupea', content: salary });
			const add = (from: string, to: string) =>
				api.inject({
					method: 'POST',
					url: `${url}/files/additions`,
					headers,
					payload: { from, to },
				});

			const moved = await add('draft.rupea', 'new.rupea');
			const merged = await add('draft2.rupea', 'new.rupea');

			expect(moved.json()).toMatchObject({
				file: { key: 'new.rupea' },
				added: 1,
				skipped: 0,
				before: null,
				draft: salary,
			});
			expect(merged.json()).toMatchObject({ added: 0, skipped: 1, before: salary });
			expect(merged.json().file).not.toHaveProperty('content');
		}));

	it('refuses to add a file to itself, which would delete it', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				method: 'POST',
				url: `${url}/files/additions`,
				headers,
				payload: { from: 'a.rupea', to: 'a.rupea' },
			});
			const kept = await api.inject({ url: `${url}/files/content?key=a.rupea`, headers });

			expect(reply.statusCode).toBe(422);
			expect(kept.json()).toMatchObject({ content: salary });
		}));

	it('finds where the next transaction of an account likely goes', ({ context }) =>
		provide(context, async () => {
			const { ledger, api, url, headers } = await seeded(context);
			await Files.createFile({ ledger, key: '_/imports/x.rupea', content: salary });

			const latest = await api.inject({ url: `${url}/latest-file?account=Assets:Bank`, headers });
			const none = await api.inject({ url: `${url}/latest-file?account=Assets:Cash`, headers });
			const files = await api.inject({ url: `${url}/transaction-files`, headers });

			expect(latest.json()).toBe('a.rupea');
			expect(none.json()).toBeNull();
			expect(files.json()).toEqual({ keys: ['a.rupea'], newest: expect.any(String) });
			expect(ledger.handle).toBeTruthy();
		}));

	it('creates a transaction, finds its form, saves a change and deletes it', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const created = await api.inject({
				method: 'POST',
				url: `${url}/transactions`,
				headers,
				payload: { form },
			});
			const listed = await api.inject({
				url: `${url}/transactions?from=2026-10-05&to=2026-10-05`,
				headers,
			});
			const id = listed.json().rows[0].id;
			const found = await api.inject({ url: `${url}/transactions/${id}`, headers });
			const changed = { ...form, description: 'Coffee' };
			const saved = await api.inject({
				method: 'PUT',
				url: `${url}/transactions`,
				headers,
				payload: { file: 'a.rupea', line: 5, version: found.json().version, form: changed },
			});
			const renamed = await api.inject({
				url: `${url}/transactions?from=2026-10-05&to=2026-10-05`,
				headers,
			});
			const reread = await api.inject({
				url: `${url}/transactions/${renamed.json().rows[0].id}`,
				headers,
			});
			const deleted = await api.inject({
				method: 'DELETE',
				url: `${url}/transactions`,
				headers,
				payload: {
					file: 'a.rupea',
					line: 5,
					version: reread.json().version,
				},
			});

			expect(created.json()).toEqual({ file: 'a.rupea', line: 5 });
			expect(found.statusCode).toBe(200);
			expect(found.json()).toMatchObject({
				file: 'a.rupea',
				line: 5,
				form: { description: 'Tea' },
			});
			expect(saved.json()).toEqual({ file: 'a.rupea', line: 5 });
			expect(reread.json().form.description).toBe('Coffee');
			expect(deleted.statusCode).toBe(200);
		}));

	it('answers 409 for a transaction changed from a stale version, and 404 for an unknown id', ({
		context,
	}) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const stale = await api.inject({
				method: 'DELETE',
				url: `${url}/transactions`,
				headers,
				payload: { file: 'a.rupea', line: 1, version: 'old' },
			});
			const unknown = await api.inject({
				url: `${url}/transactions/0194f5e0-0000-7000-8000-000000000000`,
				headers,
			});
			const malformed = await api.inject({ url: `${url}/transactions/nope`, headers });

			expect(stale.statusCode).toBe(409);
			expect(unknown.statusCode).toBe(404);
			expect(unknown.json()).toMatchObject({ data: { type: 'TransactionNotFound' } });
			expect(malformed.statusCode).toBe(400);
		}));

	it('answers 404 for a transaction whose file is gone from storage', ({ context }) =>
		provide(context, async () => {
			const { ledger, api, url, headers } = await seeded(context);
			const listed = await api.inject({
				url: `${url}/transactions?from=2026-10-01&to=2026-10-01`,
				headers,
			});
			const id = listed.json().rows[0].id;
			const storage = (await openFolder({ ledger, folder: 'files' }))._unsafeUnwrap();
			await storage.delete('a.rupea');

			const reply = await api.inject({ url: `${url}/transactions/${id}`, headers });

			expect(reply.statusCode).toBe(404);
			expect(reply.json()).toMatchObject({ data: { type: 'StorageNotFound', key: 'a.rupea' } });
		}));

	it('refuses to save a transaction under another file than its form names', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				method: 'PUT',
				url: `${url}/transactions`,
				headers,
				payload: { file: 'a.rupea', line: 1, version: 'any', form: { ...form, file: 'b.rupea' } },
			});

			expect(reply.statusCode).toBe(422);
		}));

	it('deletes a file that is not there, as deleting it again', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({
				method: 'DELETE',
				url: `${url}/files`,
				headers,
				payload: { keys: ['none.rupea'] },
			});

			expect(reply.statusCode).toBe(200);
		}));

	it('finds the form of a transaction with a time and a link to a group', ({ context }) =>
		provide(context, async () => {
			const { ledger, api, url, headers } = await seeded(context);
			const linked =
				'2026-10-02 10:30 Dinner\n\t- group: dinner\n\tExpenses:Food 20\n\tAssets:Bank\n';
			await Files.createFile({ ledger, key: 'b.rupea', content: linked });
			const listed = await api.inject({
				url: `${url}/transactions?from=2026-10-02&to=2026-10-02`,
				headers,
			});

			const found = await api.inject({
				url: `${url}/transactions/${listed.json().rows[0].id}`,
				headers,
			});

			expect(found.statusCode).toBe(200);
			expect(found.json().form).toMatchObject({ time: '10:30:00', description: 'Dinner' });
		}));

	it('describes a delete as taking its keys in a body', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const document = (await api.inject({ url: '/api/openapi.json' })).json();
			const operation = document.paths['/ledgers/{handle}/files'].delete;

			expect(operation.operationId).toBe('files.delete');
			expect(
				operation.requestBody.content['application/json'].schema.properties.keys,
			).toMatchObject({
				type: 'array',
				maxItems: 1000,
			});
		}));
});
