import { bearerOf } from '@rupea/server/tests/shared/api.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import { createApi } from '../api/api.ts';

const schema = Schemas.builtinSchemas()[0]?.content ?? '';

const seeded = async (context: Parameters<typeof createApi>[0]) => {
	const ledger = await createLedger(context.db);
	const api = await createApi(context);
	const headers = await bearerOf(ledger.owner);

	return { url: `/api/ledgers/${ledger.handle}/schemas`, api, headers };
};

describe('the schemas api', () => {
	it('saves a schema, reads it back and lists it without its text', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const saved = await api.inject({
				method: 'PUT',
				url: `${url}/bank.yml`,
				headers,
				payload: { content: schema },
			});
			const read = await api.inject({ url: `${url}/bank.yml`, headers });
			const listed = await api.inject({ url, headers });

			expect(saved.statusCode).toBe(200);
			expect(saved.json()).toMatchObject({ key: 'bank.yml', content: schema });
			expect(read.json()).toMatchObject({ key: 'bank.yml', content: schema });
			expect(listed.json()).toEqual([
				{
					key: 'bank.yml',
					size: schema.length,
					modified: expect.any(String),
					version: expect.any(String),
				},
			]);
		}));

	it('answers 422 for a schema that does not read, and saves nothing', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const saved = await api.inject({
				method: 'PUT',
				url: `${url}/bad.yml`,
				headers,
				payload: { content: 'name: nothing' },
			});
			const listed = await api.inject({ url, headers });

			expect(saved.statusCode).toBe(422);
			expect(saved.json()).toMatchObject({ data: { type: 'ExtractionInvalidSchema' } });
			expect(listed.json()).toEqual([]);
		}));

	it('deletes a schema', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			await api.inject({
				method: 'PUT',
				url: `${url}/bank.yml`,
				headers,
				payload: { content: schema },
			});

			const deleted = await api.inject({ method: 'DELETE', url: `${url}/bank.yml`, headers });
			const listed = await api.inject({ url, headers });

			expect(deleted.statusCode).toBe(200);
			expect(listed.json()).toEqual([]);
		}));

	it('refuses a key that is not a schema and text past the most a schema holds', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const key = await api.inject({ url: `${url}/bank.txt`, headers });
			const long = await api.inject({
				method: 'PUT',
				url: `${url}/bank.yml`,
				headers,
				payload: { content: 'a'.repeat(1024 * 1024 + 1) },
			});

			expect([key.statusCode, long.statusCode]).toEqual([400, 400]);
		}));

	it('takes a key with a slash as one path segment', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const encoded = encodeURIComponent('banks/hdfc.yml');

			const saved = await api.inject({
				method: 'PUT',
				url: `${url}/${encoded}`,
				headers,
				payload: { content: schema },
			});
			const read = await api.inject({ url: `${url}/${encoded}`, headers });

			expect(saved.statusCode).toBe(200);
			expect(read.json()).toMatchObject({ key: 'banks/hdfc.yml' });
		}));

	it('allows folders in a key, and refuses one that leaves them', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const save = (key: string) =>
				api.inject({
					method: 'PUT',
					url: `${url}/${key}`,
					headers,
					payload: { content: schema },
				});

			expect((await save('banks%2Fhdfc.yml')).statusCode).toBe(200);
			expect((await save('banks%2F..%2Fx.yml')).statusCode).toBe(400);
			expect((await save('a%2F%2Fb.yml')).statusCode).toBe(400);
		}));

	it('answers 404 for a schema that is not there', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({ url: `${url}/none.yml`, headers });

			expect(reply.statusCode).toBe(404);
			expect(reply.json()).toMatchObject({ data: { type: 'StorageNotFound', key: 'none.yml' } });
		}));

	it('deletes a schema that is not there, as deleting it again', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const reply = await api.inject({ method: 'DELETE', url: `${url}/none.yml`, headers });

			expect(reply.statusCode).toBe(200);
		}));
});
