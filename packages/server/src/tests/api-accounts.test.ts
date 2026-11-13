import { createORPCClient } from '@orpc/client';
import { ORPCError } from '@orpc/server';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { validate } from '@readme/openapi-parser';
import { contract, type Client } from '@rupea/contract/contract.ts';
import { Amount } from '@rupea/shared/amounts.ts';
import { Day } from '@rupea/shared/dates.ts';
import { fault } from '@rupea/shared/error.ts';
import { bearerOf } from '@rupea/server/tests/shared/api.ts';
import { createLedger } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { Readable } from 'node:stream';
import { pino } from 'pino';
import * as v from 'valibot';
import { describe, expect, onTestFinished, vi } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as Files from '#services/ledger/application/files.ts';
import { ProblemKind } from '#services/ledger/application/language.ts';
import { createApi } from '../api/api.ts';

const content = [
	'2026-10-01 Salary',
	'\tAssets:Bank 100000',
	'\tIncome:Salary',
	'',
	'2026-10-01 Dinner',
	'\tExpenses:Food 2000.5',
	'\tLiabilities:Card',
	'',
].join('\n');

const worth = {
	day: '2026-10-01',
	assets: '100000.00',
	liabilities: '-2000.50',
	worth: '97999.50',
	parts: [
		{ account: 'Assets:Bank', commodity: null, amount: '100000.00' },
		{ account: 'Liabilities:Card', commodity: null, amount: '-2000.50' },
	],
	unpriced: 0,
};

describe('the api', () => {
	it('answers with days as ISO dates and amounts as decimal strings', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const api = await createApi(context);

			const reply = await api.inject({
				url: `/api/ledgers/${ledger.handle}/worth?from=2026-10-01&to=2026-10-02`,
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toEqual({
				succeeded: [worth, { ...worth, day: '2026-10-02' }],
				failed: [],
			});
		}));

	it('answers a missing ledger with a 404 and the error as data', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const api = await createApi(context);

			const reply = await api.inject({
				url: '/api/ledgers/nowhere/worth?from=2026-10-01&to=2026-10-02',
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(404);
			expect(reply.json()).toMatchObject({
				defined: true,
				code: 'MISSING',
				data: { type: 'LedgerNotFound', handle: 'nowhere' },
			});
		}));

	it('answers a span that runs backwards with a 422 and the error as data', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const api = await createApi(context);

			const reply = await api.inject({
				url: `/api/ledgers/${ledger.handle}/worth?from=2026-10-02&to=2026-10-01`,
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(422);
			expect(reply.json()).toMatchObject({
				defined: true,
				code: 'UNPROCESSABLE',
				data: { type: 'SpanReversed', from: '2026-10-02', to: '2026-10-01' },
			});
		}));

	it('answers a span over a hundred years with a 422', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const old = ['1900-01-01 Salary', '\tAssets:Bank 500', '\tIncome:Salary', ''].join('\n');
			await Files.createFile({ ledger, key: 'a.rupea', content: old });
			const api = await createApi(context);

			const reply = await api.inject({
				url: `/api/ledgers/${ledger.handle}/worth?from=1900-01-01&to=2026-10-01`,
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(422);
			expect(reply.json()).toMatchObject({ data: { type: 'SpanTooLong', most: 36_600 } });
		}));

	it('answers 200 with what failed beside what succeeded', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });
			await Files.createFile({
				ledger,
				key: 'b.rupea',
				content: '2026-10-02 Broken\n\tAssets:Bank 5\n',
			});
			const api = await createApi(context);

			const reply = await api.inject({
				url: `/api/ledgers/${ledger.handle}/worth?from=2026-10-01&to=2026-10-01`,
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.json().succeeded).toEqual([worth]);
			expect(reply.json().failed).toEqual([
				{ type: 'ParseMissingTransactionBody', location: 'b.rupea:1' },
			]);
		}));

	it('hides what a stored 500 problem says in the failed', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const error = fault('CannotReadFile', { path: '/srv/secret', reason: 'EACCES' });
			await db
				.insertInto('problems')
				.values({ ledgerId: ledger.id, kind: ProblemKind.Parse, error })
				.execute();
			const api = await createApi(context);

			const reply = await api.inject({
				url: `/api/ledgers/${ledger.handle}/worth?from=2026-10-01&to=2026-10-01`,
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(200);
			expect(reply.body).not.toContain('/srv/secret');
			expect(reply.json().failed).toEqual([
				{ type: 'UnknownError', message: 'Internal server error' },
			]);
		}));

	it('answers 401 to a call without a bearer', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const api = await createApi(context);

			const reply = await api.inject({
				url: `/api/ledgers/${ledger.handle}/worth?from=2026-10-01&to=2026-10-02`,
			});

			expect(reply.statusCode).toBe(401);
		}));

	it('answers a path that matches no route with a 404', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({ url: '/api/nothing-here' });

			expect(reply.statusCode).toBe(404);
			expect(reply.json()).toEqual({
				defined: false,
				code: 'NOT_FOUND',
				status: 404,
				message: 'Not found',
			});
		}));

	it('refuses a body over the limit with a 413 before reading it', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/ledgers/any/worth',
				headers: { 'content-type': 'application/json', 'content-length': String(65 * 1024 * 1024) },
			});

			expect(reply.statusCode).toBe(413);
		}));

	it('refuses a chunked body over the limit with a 413', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);
			const chunk = Buffer.alloc(1024 * 1024);
			const body = Readable.from(Array.from({ length: 65 }, () => chunk));

			const reply = await api.inject({
				method: 'POST',
				url: '/api/ledgers/any/worth',
				headers: { 'content-type': 'application/json' },
				payload: body,
			});

			expect(reply.statusCode).toBe(413);
		}));

	it('refuses a body larger than its content-length says with a 413', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/ledgers/any/worth',
				headers: { 'content-type': 'application/json', 'content-length': '2' },
				payload: Buffer.alloc(65 * 1024 * 1024),
			});

			expect(reply.statusCode).toBe(413);
		}));

	it('refuses a content-length that is not a length with a 400', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const replies = await Promise.all(
				['abc', '-1'].map((length) =>
					api.inject({
						method: 'POST',
						url: '/api/ledgers/any/worth',
						headers: { 'content-type': 'application/json', 'content-length': length },
						payload: '{}',
					}),
				),
			);

			expect(replies.map((r) => r.statusCode)).toEqual([400, 400]);
			expect(replies[0]?.json()).toEqual({
				defined: false,
				code: 'BAD_REQUEST',
				status: 400,
				message: 'Invalid request',
			});
		}));

	it('accepts a chunked body under the limit', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/ledgers/any/worth',
				headers: { 'content-type': 'application/json' },
				payload: Readable.from([Buffer.from('{}')]),
			});

			expect(reply.statusCode).toBe(404);
		}));

	it('refuses a day that does not exist before it reaches the ledger', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				url: '/api/ledgers/any/worth?from=2026-02-30&to=2026-03-01',
			});

			expect(reply.statusCode).toBe(400);
		}));

	it('names the invalid field in a 400 without echoing what the caller sent', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				url: '/api/ledgers/any/worth?from=2026-02-30&to=2026-03-01',
			});

			expect(reply.json().data.issues).toEqual([{ path: ['from'], message: expect.any(String) }]);
			expect(reply.body).not.toContain('2026-02-30');
		}));

	it('answers a bad request without issues with a generic body', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const secret = 'secret-value';
			const error = new ORPCError('BAD_REQUEST', { message: secret, data: { secret } });
			const spy = vi.spyOn(Ledger, 'withLedger').mockRejectedValue(error);
			onTestFinished(() => spy.mockRestore());
			const api = await createApi(context);

			const reply = await api.inject({
				url: '/api/ledgers/any/worth?from=2026-10-01&to=2026-10-02',
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(400);
			expect(reply.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Invalid input' });
			expect(reply.body).not.toContain(secret);
		}));

	it('logs a failure with the request id', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const lines: string[] = [];
			const logger = pino({ level: 'error' }, { write: (line: string) => lines.push(line) });
			const spy = vi.spyOn(Ledger, 'withLedger').mockRejectedValue(new Error('boom'));
			onTestFinished(() => spy.mockRestore());
			const api = await createApi({ ...context, logger });

			const reply = await api.inject({
				url: '/api/ledgers/any/worth?from=2026-10-01&to=2026-10-02',
				headers: await bearerOf(ledger.owner),
			});

			expect(reply.statusCode).toBe(500);
			expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ msg: 'request failed', reqId: 'req-1' });
		}));

	it.for([
		[500, 'INTERNAL_SERVER_ERROR', 'Internal server error'],
		[503, 'INTERNAL_SERVER_ERROR', 'Internal server error'],
		[418, 'BAD_REQUEST', 'Invalid request'],
	] as const)(
		'answers a host failure with %s in the shape of every other error, without its text',
		async ([status, code, message], { context }) => {
			await provide(context, async () => {
				const lines: string[] = [];
				const logger = pino({ level: 'error' }, { write: (line: string) => lines.push(line) });
				const api = await createApi({ ...context, logger });
				api.get('/boom', () => {
					throw Object.assign(new Error('relation "users" does not exist'), { statusCode: status });
				});

				const reply = await api.inject({ url: '/boom' });

				expect(reply.statusCode).toBe(status);
				expect(reply.json()).toEqual({ defined: false, code, status, message });
				expect(lines).toHaveLength(status >= 500 ? 1 : 0);
				if (status >= 500)
					expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
						msg: 'request failed',
						reqId: 'req-1',
					});
			});
		},
	);

	it('describes days and amounts as strings in a valid OpenAPI document', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const document = (await api.inject({ url: '/api/openapi.json' })).json();
			const operation = document.paths['/ledgers/{handle}/worth'].get;
			const [, from] = operation.parameters;
			const day =
				operation.responses['200'].content['application/json'].schema.properties.succeeded.items
					.properties;

			expect((await validate(document)).valid).toBe(true);
			expect(from.schema).toMatchObject({ type: 'string', format: 'date' });
			expect(day.day).toMatchObject({ type: 'string', format: 'date' });
			expect(day.worth).toMatchObject({
				type: 'string',
				pattern: '^([+-]?)(\\d{1,28})(?:\\.(\\d{1,10}))?$',
			});
		}));

	it('describes the error once, for every status a route answers it with', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const document = (await api.inject({ url: '/api/openapi.json' })).json();
			const operation = document.paths['/ledgers/{handle}/worth'].get;
			const ref = { $ref: '#/components/schemas/RupeaError' };
			const body = (status: string) =>
				operation.responses[status].content['application/json'].schema.oneOf[0].properties;
			const output = operation.responses['200'].content['application/json'].schema.properties;
			const types = document.components.schemas.RupeaError.oneOf.map(
				(e: { properties: { type: { const: string } } }) => e.properties.type.const,
			);

			expect((await validate(structuredClone(document))).valid).toBe(true);
			expect(types).toContain('LedgerNotFound');
			expect(body('404').data).toMatchObject(ref);
			expect(body('422').code).toEqual({ const: 'UNPROCESSABLE' });
			expect(output.failed.items).toEqual(ref);
		}));

	it('serves a path of the document under the server it declares', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);
			const document = (await api.inject({ url: '/api/openapi.json' })).json();
			const path = Object.keys(document.paths)[0];

			const reply = await api.inject({ url: `${document.servers[0].url}${path}` });

			expect(document.servers).toEqual([{ url: '/api' }]);
			expect(reply.statusCode).not.toBe(404);
		}));

	it('serves every operation of the document', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);
			const document = (await api.inject({ url: '/api/openapi.json' })).json();
			const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
				Object.keys(methods as object).map((method) => ({ path, method })),
			);

			const replies = await Promise.all(
				operations.map(({ path, method }) =>
					api.inject({
						method: method.toUpperCase() as 'GET',
						url: `/api${path.replace(/\{\w+\}/g, 'x')}`,
					}),
				),
			);

			expect(operations.length).toBeGreaterThan(0);
			expect(replies.map((r) => r.statusCode)).not.toContain(404);
		}));

	it('lets a client typed by the contract call it and decode what it gets', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'a.rupea', content });
			const api = await createApi(context);
			onTestFinished(() => api.close());
			const url = await api.listen({ port: 0 });
			const link = new OpenAPILink(contract, {
				url: `${url}/api`,
				headers: await bearerOf(ledger.owner),
			});
			const client: Client = createORPCClient(link);

			const first = (
				await client.accounts.listWorth({
					handle: ledger.handle,
					from: '2026-10-01',
					to: '2026-10-01',
				})
			).succeeded[0];

			expect(first).toEqual(worth);
			expect(v.parse(Day, first?.day).year).toBe(2026);
			expect(v.parse(Amount, first?.worth)).toBe(97999_5000000000n);
		}));
});
