import { createORPCClient } from '@orpc/client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { contract, type Client } from '@rupea/contract/contract.ts';
import { bearerOf, multipart } from '@rupea/server/tests/shared/api.ts';
import { broken } from '@rupea/server/tests/shared/embedding.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import officeCrypto from 'officecrypto-tool';
import { readFile } from 'node:fs/promises';
import pino from 'pino';
import * as XLSX from 'xlsx';
import { describe, expect, onTestFinished } from 'vitest';
import { fault } from '@rupea/shared/error.ts';
import { MOST_STATEMENT, MOST_UPLOADS } from '@rupea/shared/statements.ts';
import { json } from '#lib/server/db/expressions.ts';
import { provide, type RupeaContext } from '#lib/server/shared/context/context.ts';
import { JobStatus } from '#services/jobs/domain/jobs.ts';
import { bank, day, folder, statement } from '#services/extraction/tests/fixtures/bank.ts';
import { createApi } from '../api/api.ts';

const pdf = new URL('../services/extraction/tests/fixtures/idfc-card.pdf', import.meta.url);

const lockedSheet = async () => {
	const book = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Date', 'Narration']]));
	const plain = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

	return new Uint8Array(await officeCrypto.encrypt(plain, { password: 'secret' }));
};

const formOf = (files: [string, string | Uint8Array][], style = (i: number) => `files[${i}]`) => {
	const form = new FormData();
	files.forEach(([name, content], i) => {
		const part = typeof content === 'string' ? content : new Uint8Array(content);
		form.append(style(i), new File([part], name));
	});

	return multipart(form);
};

const seeded = async (context: RupeaContext) => {
	const ledger = await createLedger(context.db);
	const api = await createApi({ ...context, models: broken(context.models) });
	const headers = await bearerOf(ledger.owner);
	const url = `/api/ledgers/${ledger.handle}/statements`;
	const upload = async (name: string, content: string | Uint8Array = statement) => {
		const sent = await formOf([[name, content]]);
		const reply = await api.inject({
			method: 'POST',
			url,
			payload: sent.payload,
			headers: { ...headers, ...sent.headers },
		});

		return reply.json<{ succeeded: string[] }>().succeeded[0] ?? '';
	};

	return { ledger, url, api, headers, upload, base: `/api/ledgers/${ledger.handle}` };
};

describe('uploading statements', () => {
	it('stores each file under its name with its bytes, and answers its key', ({
		context,
		storage,
	}) =>
		provide(context, async () => {
			const { api, ledger, url, headers } = await seeded(context);
			const bytes = new Uint8Array(await readFile(pdf));
			const sent = await formOf([
				['aug.csv', statement],
				['card.pdf', bytes],
			]);

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload,
				headers: { ...headers, ...sent.headers },
			});
			const stored = await storage.read(`${folder(ledger)}/files/_/statements/${day()}/card.pdf`);

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({
				succeeded: [`${day()}/aug.csv`, `${day()}/card.pdf`],
				failed: [],
			});
			expect(Buffer.from(stored._unsafeUnwrap().content).equals(bytes)).toBe(true);
		}));

	it('takes the files a client typed by the contract sends', async ({ context, storage }) => {
		await provide(context, async () => {
			const { api, ledger, headers } = await seeded(context);
			onTestFinished(() => api.close());
			const url = await api.listen({ port: 0 });
			const client: Client = createORPCClient(
				new OpenAPILink(contract, { url: `${url}/api`, headers }),
			);

			const uploaded = await client.statements.upload({
				handle: ledger.handle,
				files: [new File([statement], 'aug.csv'), new File(['x,y'], 'sep.csv')],
			});
			const stored = await storage.read(`${folder(ledger)}/files/_/statements/${day()}/sep.csv`);

			expect(uploaded).toEqual({
				succeeded: [`${day()}/aug.csv`, `${day()}/sep.csv`],
				failed: [],
			});
			expect(new TextDecoder().decode(stored._unsafeUnwrap().content)).toBe('x,y');
		});
	});

	it.for(['files[]', 'files[0]'])('takes one file named %s', async (name, { context }) => {
		await provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const sent = await formOf([['aug.csv', statement]], () => name);

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload,
				headers: { ...headers, ...sent.headers },
			});

			expect(reply.json()).toEqual({ succeeded: [`${day()}/aug.csv`], failed: [] });
		});
	});

	it('refuses a lone file named files, which is no list, with a 400', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const sent = await formOf([['aug.csv', statement]], () => 'files');

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload,
				headers: { ...headers, ...sent.headers },
			});

			expect(reply.statusCode).toBe(400);
		}));

	it('reports a file of a kind it cannot read as failed, and stores the rest', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const sent = await formOf([
				['virus.exe', 'x'],
				['aug.csv', statement],
			]);

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload,
				headers: { ...headers, ...sent.headers },
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({
				succeeded: [`${day()}/aug.csv`],
				failed: [{ type: 'ExtractionUnsupportedFile', path: 'virus.exe' }],
			});
		}));

	it('refuses more files than the most, and a file past the size bound, with a 400', ({
		context,
		storage,
	}) =>
		provide(context, async () => {
			const { api, ledger, url, headers } = await seeded(context);
			const many = await formOf(
				Array.from({ length: MOST_UPLOADS + 1 }, (_, i): [string, string] => [`${i}.csv`, 'x']),
			);
			const large = await formOf([['big.csv', new Uint8Array(MOST_STATEMENT + 1)]]);
			const send = (sent: Awaited<ReturnType<typeof formOf>>) =>
				api.inject({
					method: 'POST',
					url,
					payload: sent.payload,
					headers: { ...headers, ...sent.headers },
				});

			const replies = await Promise.all([send(many), send(large)]);
			const stored = await storage.list(`${folder(ledger)}/files/_/statements/`);

			expect(replies.map((r) => r.statusCode)).toEqual([400, 400]);
			expect(stored._unsafeUnwrap()).toEqual([]);
		}));

	it('refuses a name past 255 bytes, and accepts one at 255 bytes of multibyte letters', ({
		context,
	}) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const send = async (name: string) => {
				const sent = await formOf([[name, 'x']]);
				const reply = await api.inject({
					method: 'POST',
					url,
					payload: sent.payload,
					headers: { ...headers, ...sent.headers },
				});

				return reply.statusCode;
			};

			expect(await send(`${'é'.repeat(126)}.csv`)).toBe(400);
			expect(await send(`${'é'.repeat(125)}.csv`)).toBe(200);
		}));

	it('answers 401 to a large body without a session, before reading it', ({ context, storage }) =>
		provide(context, async () => {
			const { api, ledger, url, headers } = await seeded(context);
			const padding = ' '.repeat(2 * 1024 * 1024);
			const sent = await formOf([['big.csv', padding]]);
			const send = (payload: string | Buffer, type: string, auth = {}) =>
				api.inject({ method: 'POST', url, payload, headers: { 'content-type': type, ...auth } });

			const replies = await Promise.all([
				send(sent.payload, sent.headers['content-type']),
				send(`{${padding}`, 'application/json'),
				send(padding, 'text/plain'),
				send(sent.payload, sent.headers['content-type'], { authorization: 'Bearer nope' }),
			]);
			const signedIn = await send(`{${padding}`, 'application/json', headers);
			const stored = await storage.list(`${folder(ledger)}/files/_/statements/`);

			expect(replies.map((r) => r.statusCode)).toEqual([401, 401, 401, 401]);
			expect(replies[0]?.json()).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
			expect(signedIn.statusCode).toBe(400);
			expect(stored._unsafeUnwrap()).toEqual([]);
		}));

	it('answers 413 to a body past the limit, with or without a session', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const payload = Buffer.alloc(64 * 1024 * 1024 + 1);
			const send = (auth = {}) =>
				api.inject({
					method: 'POST',
					url,
					payload,
					headers: { 'content-type': 'text/plain', ...auth },
				});

			expect([(await send()).statusCode, (await send(headers)).statusCode]).toEqual([413, 413]);
		}));

	it('uploads a file of 2 MiB with a session', ({ context }) =>
		provide(context, async () => {
			const { upload } = await seeded(context);

			expect(await upload('large.csv', `${statement}${'\n'.repeat(2 * 1024 * 1024)}`)).toMatch(
				/large\.csv$/,
			);
		}));

	it('accepts a file at the size bound', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const sent = await formOf([['edge.txt', new Uint8Array(MOST_STATEMENT)]]);

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload,
				headers: { ...headers, ...sent.headers },
			});

			expect(reply.statusCode).toBe(200);
		}));

	it.for(['a/b.csv', '..', 'a\\b.csv'])(
		'refuses a name that is not one key segment, as %s, with a 400',
		async (name, { context }) => {
			await provide(context, async () => {
				const { api, url, headers } = await seeded(context);
				const sent = await formOf([[name, statement]]);

				const reply = await api.inject({
					method: 'POST',
					url,
					payload: sent.payload,
					headers: { ...headers, ...sent.headers },
				});

				expect(reply.statusCode).toBe(400);
			});
		},
	);

	it('refuses a body past the limit of the host with a 413', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const sent = await formOf([
				['a.csv', new Uint8Array(MOST_STATEMENT)],
				['b.csv', new Uint8Array(MOST_STATEMENT)],
				['c.csv', new Uint8Array(MOST_STATEMENT)],
			]);

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload,
				headers: { ...headers, ...sent.headers },
			});

			expect(reply.statusCode).toBe(413);
		}));

	it('refuses a body that is not multipart: JSON with a 400, other types with a 415', ({
		context,
	}) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);

			const json = await api.inject({ method: 'POST', url, headers, payload: { files: ['x'] } });
			const text = await api.inject({
				method: 'POST',
				url,
				headers: { ...headers, 'content-type': 'text/plain' },
				payload: 'files',
			});

			expect([json.statusCode, text.statusCode]).toEqual([400, 415]);
		}));

	it('refuses a multipart body that is cut short with a 400', ({ context }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const sent = await formOf([['aug.csv', statement]]);

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload.subarray(0, 60),
				headers: { ...headers, ...sent.headers },
			});

			expect(reply.statusCode).toBe(400);
			expect(reply.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Invalid request' });
		}));

	it('answers no server path, only the keys the ledger holds', ({ context, root }) =>
		provide(context, async () => {
			const { api, url, headers } = await seeded(context);
			const sent = await formOf([['aug.csv', statement]]);

			const reply = await api.inject({
				method: 'POST',
				url,
				payload: sent.payload,
				headers: { ...headers, ...sent.headers },
			});

			expect(reply.body).not.toContain(root);
			expect(reply.body).not.toContain('users/');
		}));

	it('answers 401 without a session', ({ context }) =>
		provide(context, async () => {
			const { api, url } = await seeded(context);
			const sent = await formOf([['aug.csv', statement]]);

			const reply = await api.inject({ method: 'POST', url, ...sent });

			expect(reply.statusCode).toBe(401);
		}));
});

describe('reading statements', () => {
	it('lists what was uploaded, reads its grid and queues an import for it', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('aug.csv');

			const listed = await api.inject({ url: `${base}/statements`, headers });
			const read = await api.inject({
				url: `${base}/statements/content?statement=${key}`,
				headers,
			});
			const imports = await api.inject({ url: `${base}/imports`, headers });

			expect(listed.json()).toEqual([{ key, file: null }]);
			expect(read.json()).toEqual({ key, grid: expect.any(Array) });
			expect(read.json().grid[0]).toEqual(['Account statement']);
			expect(Object.keys(read.json())).toEqual(['key', 'grid']);
			expect(imports.json()).toEqual([
				{ id: expect.any(String), status: 'queued', statement: key, error: null },
			]);
		}));

	it('answers 404 for a statement that is not stored, naming the key the ledger holds', ({
		context,
	}) =>
		provide(context, async () => {
			const { api, base, headers } = await seeded(context);

			const reply = await api.inject({
				url: `${base}/statements/content?statement=20200101/none.csv`,
				headers,
			});

			expect(reply.statusCode).toBe(404);
			expect(reply.json()).toMatchObject({
				data: { type: 'StorageNotFound', key: '20200101/none.csv' },
			});
			expect(reply.body).not.toContain('users/');
		}));

	it.for(['', '../x.csv', 'a//b.csv', `${'a'.repeat(513)}.csv`])(
		'refuses the key %j with a 400',
		async (key, { context }) => {
			await provide(context, async () => {
				const { api, base, headers } = await seeded(context);

				const reply = await api.inject({
					url: `${base}/statements/content?statement=${encodeURIComponent(key)}`,
					headers,
				});

				expect(reply.statusCode).toBe(400);
			});
		},
	);

	it('sanitises the error of an import that failed', ({ context, db }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			await upload('aug.csv');
			await db
				.updateTable('jobs')
				.set({
					status: JobStatus.Failed,
					error: json(fault('CannotReadFile', { path: '/srv/secret', reason: 'x' })),
				})
				.execute();

			const reply = await api.inject({ url: `${base}/imports`, headers });

			expect(reply.json()).toMatchObject([
				{ status: 'failed', error: { type: 'UnknownError', message: 'Internal server error' } },
			]);
			expect(reply.body).not.toContain('/srv/secret');
		}));

	it('deletes each statement on its own, and lists none after', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('aug.csv');

			const deleted = await api.inject({
				method: 'DELETE',
				url: `${base}/statements`,
				headers,
				payload: { keys: [key, '20200101/none.csv'] },
			});
			const listed = await api.inject({ url: `${base}/statements`, headers });

			expect(deleted.statusCode).toBe(200);
			expect(deleted.json()).toEqual({ succeeded: [key, '20200101/none.csv'], failed: [] });
			expect(listed.json()).toEqual([]);
		}));

	it('refuses no keys, or more than the most, to delete with a 400', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers } = await seeded(context);
			const send = (keys: string[]) =>
				api.inject({ method: 'DELETE', url: `${base}/statements`, headers, payload: { keys } });

			const replies = await Promise.all([send([]), send(Array(1001).fill('20200101/a.csv'))]);

			expect(replies.map((r) => r.statusCode)).toEqual([400, 400]);
		}));
});

describe('unlocking a statement', () => {
	it('opens a locked sheet with its password, and answers its grid', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('locked.xlsx', await lockedSheet());
			const read = await api.inject({
				url: `${base}/statements/content?statement=${key}`,
				headers,
			});

			const wrong = await api.inject({
				method: 'POST',
				url: `${base}/statements/unlock`,
				headers,
				payload: { statement: key, password: 'wrong' },
			});
			const right = await api.inject({
				method: 'POST',
				url: `${base}/statements/unlock`,
				headers,
				payload: { statement: key, password: 'secret' },
			});

			expect(read.statusCode).toBe(422);
			expect(read.json()).toMatchObject({ data: { type: 'ExtractionLocked', path: key } });
			expect(wrong.statusCode).toBe(422);
			expect(wrong.json()).toMatchObject({ data: { type: 'ExtractionLocked', path: key } });
			expect(right.json()).toEqual({ key, grid: [['Date', 'Narration']] });
		}));

	it('refuses an empty password or one past the most with a 400', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('locked.xlsx', await lockedSheet());
			const send = (password: string) =>
				api.inject({
					method: 'POST',
					url: `${base}/statements/unlock`,
					headers,
					payload: { statement: key, password },
				});

			const replies = await Promise.all([send(''), send('x'.repeat(257))]);

			expect(replies.map((r) => r.statusCode)).toEqual([400, 400]);
		}));

	it('answers 422 for a statement that is not locked', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('aug.csv');

			const reply = await api.inject({
				method: 'POST',
				url: `${base}/statements/unlock`,
				headers,
				payload: { statement: key, password: 'x' },
			});

			expect(reply.statusCode).toBe(422);
		}));
});

describe('describing and importing a statement', () => {
	it('recognises the schema that reads it', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('aug.csv');
			await api.inject({
				method: 'PUT',
				url: `${base}/schemas/${bank.key}`,
				headers,
				payload: { content: bank.content },
			});

			const reply = await api.inject({
				url: `${base}/statements/schema?statement=${key}`,
				headers,
			});

			expect(reply.json()).toEqual({ ...bank, builtin: false });
		}));

	it('previews its draft with an unsaved schema, with what failed to read', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('aug.csv');

			const reply = await api.inject({
				method: 'POST',
				url: `${base}/statements/preview`,
				headers,
				payload: { statement: key, schema: bank },
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json().succeeded.map((t: { description: string }) => t.description)).toEqual([
				'UPI GROCER',
				'SALARY',
			]);
			expect(reply.json().failed).toEqual([
				expect.objectContaining({ type: 'ExtractionInvalidField' }),
			]);
		}));

	it('imports it as a draft for review, and lists the file it went to', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('aug.csv');

			const reply = await api.inject({
				method: 'POST',
				url: `${base}/statements/import`,
				headers,
				payload: { statement: key, schema: bank },
			});
			const listed = await api.inject({ url: `${base}/statements`, headers });

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({ key: expect.stringMatching(/aug/) });
			expect(listed.json()).toEqual([{ key, file: reply.json().key }]);
		}));

	it('refuses a schema key that is no schema key with a 400', ({ context }) =>
		provide(context, async () => {
			const { api, base, headers, upload } = await seeded(context);
			const key = await upload('aug.csv');

			const reply = await api.inject({
				method: 'POST',
				url: `${base}/statements/preview`,
				headers,
				payload: { statement: key, schema: { key: '../x.yml', content: '' } },
			});

			expect(reply.statusCode).toBe(400);
		}));
});

describe('logging', () => {
	it('writes no body: not a password, nor the text of a statement', async ({ context }) => {
		const lines: string[] = [];
		const logger = pino({ level: 'trace' }, { write: (line: string) => lines.push(line) });
		const loud = { ...context, logger };
		await provide(loud, async () => {
			const { api, base, headers, upload } = await seeded(loud);
			const key = await upload('locked.xlsx', await lockedSheet());
			await upload('note.csv', 'MARKER-TEXT');
			const send = (password: string) =>
				api.inject({
					method: 'POST',
					url: `${base}/statements/unlock`,
					headers,
					payload: { statement: key, password },
				});

			await send('wrong-password-1');
			await send('secret');
			await send('x'.repeat(300) + 'long-password-2');

			expect(lines.length).toBeGreaterThan(3);
			for (const text of ['wrong-password-1', 'long-password-2', 'secret', 'MARKER-TEXT'])
				expect(lines.join('')).not.toContain(text);
		});
	});
});

describe('the document', () => {
	it('describes the upload as a form of binary files, and not as JSON', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({ url: '/api/openapi.json' });
			const content = reply.json().paths['/ledgers/{handle}/statements'].post.requestBody.content;

			expect(Object.keys(content)).toEqual(['multipart/form-data']);
			expect(content['multipart/form-data'].schema.properties.files).toMatchObject({
				type: 'array',
				items: { type: 'string', format: 'binary' },
				minItems: 1,
				maxItems: MOST_UPLOADS,
			});
		}));
});
