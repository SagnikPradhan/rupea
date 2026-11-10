import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, onTestFinished, vi } from 'vitest';
import { provide, type RupeaContext } from '#lib/server/shared/context/context.ts';
import type { Mail } from '#lib/server/shared/context/mailer.ts';
import { okAsync } from '#lib/server/shared/result/result.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import * as Auth from '#services/auth/application/auth.ts';
import { createApi } from '../api/api.ts';

const EMAIL = 'ada@example.com';
const DAY = 24 * 60 * 60 * 1000;

const codeIn = (mail: Mail | undefined) => mail?.subject.match(/(\d{6})$/)?.[1] ?? '';

const inbox = (context: RupeaContext) => {
	const sent: Mail[] = [];
	const mailer = {
		send: (mail: Mail) => {
			sent.push(mail);
			return okAsync();
		},
	};
	const config = { ...context.config, accounts: { signup: 'open' as const } };
	return { sent, context: { ...context, mailer, config } };
};

const signIn = async (api: Awaited<ReturnType<typeof createApi>>, sent: Mail[]) => {
	await api.inject({ method: 'POST', url: '/api/auth/code', payload: { email: EMAIL } });
	return api.inject({
		method: 'POST',
		url: '/api/auth/sign-in',
		payload: { email: EMAIL, code: codeIn(sent[0]) },
	});
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('the auth routes', () => {
	it('signs in with a mailed code, which then names the user', ({ context }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);

			const signedIn = await signIn(api, mail.sent);
			const { token, expiresAt } = signedIn.json();
			const found = await api.inject({ url: '/api/auth/user', headers: bearer(token) });

			expect(signedIn.statusCode).toBe(200);
			expect(expiresAt).toBe('2026-11-09T09:00:00Z');
			expect(found.json()).toMatchObject({ user: { email: EMAIL }, expiresAt: null });
		});
	});

	it('answers a wrong code with a 401 and the error as data', ({ context }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);
			await api.inject({ method: 'POST', url: '/api/auth/code', payload: { email: EMAIL } });

			const out = await api.inject({
				method: 'POST',
				url: '/api/auth/sign-in',
				payload: { email: EMAIL, code: '000000' },
			});

			expect(out.statusCode).toBe(401);
			expect(out.json()).toMatchObject({
				defined: true,
				code: 'UNAUTHENTICATED',
				data: { type: 'AuthInvalidCode' },
			});
		});
	});

	it('names a new expiry only when the call extended the session', ({ context }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);
			const { token } = (await signIn(api, mail.sent)).json();

			vi.setSystemTime(Date.now() + 14 * DAY);
			const early = await api.inject({ url: '/api/auth/user', headers: bearer(token) });
			vi.setSystemTime(Date.now() + 2 * DAY);
			const late = await api.inject({ url: '/api/auth/user', headers: bearer(token) });
			const after = await api.inject({ url: '/api/auth/user', headers: bearer(token) });

			expect(early.json().expiresAt).toBeNull();
			expect(late.json().expiresAt).toBe('2026-11-25T09:00:00Z');
			expect(after.json().expiresAt).toBeNull();
		});
	});

	it('renews a session on the user call only, not on any other', ({ context }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);
			const { token } = (await signIn(api, mail.sent)).json();
			vi.setSystemTime(Date.now() + 16 * DAY);

			const worth = await api.inject({
				url: '/api/ledgers/any/worth?from=2026-10-01&to=2026-10-02',
				headers: bearer(token),
			});
			const user = await api.inject({ url: '/api/auth/user', headers: bearer(token) });

			expect(worth.statusCode).not.toBe(401);
			expect(user.json().expiresAt).toBe('2026-11-25T09:00:00Z');
		});
	});

	it('answers 401 to a missing, unknown or malformed bearer', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);
			const headers = [{}, bearer('unknown'), { authorization: 'Basic abc' }];

			const replies = await Promise.all(
				headers.map((h) => api.inject({ url: '/api/auth/user', headers: h })),
			);

			expect(replies.map((r) => r.statusCode)).toEqual([401, 401, 401]);
			expect(replies[0]?.json()).toMatchObject({ code: 'UNAUTHORIZED' });
		}));

	it('ends the session of the bearer on sign-out', ({ context }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);
			const { token } = (await signIn(api, mail.sent)).json();

			const out = await api.inject({
				method: 'POST',
				url: '/api/auth/sign-out',
				headers: bearer(token),
			});
			const found = await api.inject({ url: '/api/auth/user', headers: bearer(token) });

			expect(out.statusCode).toBe(200);
			expect(found.statusCode).toBe(401);
		});
	});

	it('answers a failing session lookup with a sanitised 500, and logs it', ({ context, db }) => {
		const lines: string[] = [];
		const logger = pino({ level: 'error' }, { write: (line: string) => lines.push(line) });
		return provide({ ...context, logger }, async () => {
			const api = await createApi({ ...context, logger });
			const failing = vi.spyOn(db, 'selectFrom').mockImplementation(() => {
				throw new Error('database down: secret-detail');
			});
			onTestFinished(() => failing.mockRestore());

			const reply = await api.inject({ url: '/api/auth/user', headers: bearer('any-token') });

			expect(reply.statusCode).toBe(500);
			expect(reply.json()).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
			expect(reply.body).not.toContain('secret-detail');
			expect(lines.join('')).toContain('session lookup failed');
		});
	});

	it('does not look up a session on a public route', ({ context }) =>
		provide(context, async () => {
			const lookup = vi.spyOn(Auth, 'validateSession');
			onTestFinished(() => lookup.mockRestore());
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/auth/code',
				headers: bearer('garbage'),
				payload: { email: 'not an email' },
			});

			expect(reply.statusCode).toBe(400);
			expect(lookup).not.toHaveBeenCalled();
		}));

	it('answers a sanitised 500 when the session cannot be ended', ({ context, db }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);
			const { token } = (await signIn(api, mail.sent)).json();
			const failing = vi.spyOn(db, 'deleteFrom').mockImplementation(() => {
				throw new Error('database down: secret-detail');
			});
			onTestFinished(() => failing.mockRestore());

			const out = await api.inject({
				method: 'POST',
				url: '/api/auth/sign-out',
				headers: bearer(token),
			});

			expect(out.statusCode).toBe(500);
			expect(out.json()).toEqual({
				defined: true,
				code: 'FAULT',
				status: 500,
				message: 'FAULT',
				data: { type: 'UnknownError', message: 'Internal server error' },
			});
			expect(out.body).not.toContain('secret-detail');
		});
	});

	it('refuses to sign out without a bearer', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({ method: 'POST', url: '/api/auth/sign-out' });

			expect(reply.statusCode).toBe(401);
		}));
});

describe('caching', () => {
	it('is forbidden on every reply of the auth routes, errors included', ({ context }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);
			const { token } = (await signIn(api, mail.sent)).json();

			const replies = await Promise.all([
				api.inject({ url: '/api/auth/user', headers: bearer(token) }),
				api.inject({ url: '/api/auth/user' }),
				api.inject({ url: '/api/auth/user?x=1', headers: bearer(token) }),
				api.inject({ method: 'POST', url: '/api/auth/code', payload: { email: 'no' } }),
				api.inject({ method: 'POST', url: '/api/auth/nothing' }),
			]);

			expect(replies.map((r) => r.headers['cache-control'])).toEqual(Array(5).fill('no-store'));
		});
	});

	it('is left alone on the other routes', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({ url: '/api/openapi.json' });

			expect(reply.headers['cache-control']).toBeUndefined();
		}));
});

describe('a JSON body', () => {
	it('is decoded before the procedure reads it', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/auth/code',
				payload: { email: 'not an email' },
			});

			expect(reply.statusCode).toBe(400);
			expect(reply.json().data.issues).toEqual([{ path: ['email'], message: expect.any(String) }]);
		}));

	it('is refused with a generic 400 when it is not JSON', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/auth/code',
				headers: { 'content-type': 'application/json' },
				payload: '{"email": secret-text',
			});

			expect(reply.statusCode).toBe(400);
			expect(reply.body).not.toContain('secret-text');
		}));

	it('is refused in the shape of every other error when it is not JSON', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/auth/code',
				headers: { 'content-type': 'application/json' },
				payload: '{"email": nope',
			});

			expect(reply.json()).toEqual({
				defined: false,
				code: 'BAD_REQUEST',
				status: 400,
				message: 'Invalid request',
			});
		}));

	it('may be empty, as the body of a sign-out is', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/auth/sign-out',
				headers: { 'content-type': 'application/json' },
			});

			expect(reply.statusCode).toBe(401);
		}));
});

describe('a body of another type', () => {
	const send = (api: Awaited<ReturnType<typeof createApi>>, type: string) =>
		api.inject({
			method: 'POST',
			url: '/api/auth/code',
			headers: { 'content-type': type },
			payload: '{"email":"ada@example.com"}',
		});

	it.for(['application/vnd.api+json', 'text/json', 'text/plain', 'application/xml'])(
		'is refused with a 415 when it is %s',
		async (type, { context }) => {
			await provide(context, async () => {
				const api = await createApi(context);

				const reply = await send(api, type);

				expect(reply.statusCode).toBe(415);
				expect(reply.json()).toEqual({
					defined: false,
					code: 'UNSUPPORTED_MEDIA_TYPE',
					status: 415,
					message: 'Send application/json',
				});
			});
		},
	);

	it('is refused with a 415 when it has no type at all', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'POST',
				url: '/api/auth/code',
				payload: Buffer.from('{"email":"ada@example.com"}'),
			});

			expect(reply.statusCode).toBe(415);
		}));

	it.for(['text/plain', 'application/x-www-form-urlencoded', 'application/xml'])(
		'may be empty whatever its type, as %s',
		async (type, { context }) => {
			await provide(context, async () => {
				const api = await createApi(context);

				const empty = await api.inject({
					method: 'POST',
					url: '/api/auth/sign-out',
					headers: { 'content-type': type, 'content-length': '0' },
				});
				const absent = await api.inject({
					method: 'POST',
					url: '/api/auth/sign-out',
					headers: { 'content-type': type },
				});

				expect([empty.statusCode, absent.statusCode]).toEqual([401, 401]);
			});
		},
	);

	it('is allowed as JSON with a charset', ({ context }) => {
		const mail = inbox(context);
		return provide(mail.context, async () => {
			const api = await createApi(mail.context);

			const reply = await send(api, 'application/json; charset=utf-8');

			expect(reply.statusCode).toBe(200);
			expect(mail.sent).toHaveLength(1);
		});
	});

	it('is allowed as multipart, which reaches the procedure', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await send(api, 'multipart/form-data; boundary=x');

			expect(reply.statusCode).not.toBe(415);
		}));

	it('is not asked of a GET, which has none', ({ context }) =>
		provide(context, async () => {
			const api = await createApi(context);

			const reply = await api.inject({ url: '/api/auth/user' });

			expect(reply.statusCode).toBe(401);
		}));
});

describe('logging', () => {
	const shapes = {
		'at the top': (headers: object) => ({ headers }),
		'one level down': (headers: object) => ({ request: { headers } }),
		'two levels down': (headers: object) => ({ event: { request: { headers } } }),
	};

	it.for(Object.entries(shapes))(
		'never writes a token or a cookie, even when a hook logs the headers %s',
		async ([, shape], { context }) => {
			const lines: string[] = [];
			const logger = pino({ level: 'trace' }, { write: (line: string) => lines.push(line) });
			await provide({ ...context, logger }, async () => {
				const api = await createApi({ ...context, logger });
				api.addHook('onRequest', async (req) => req.log.info(shape(req.headers)));

				await api.inject({
					url: '/api/auth/user',
					headers: { ...bearer('secret-token'), cookie: 'session=secret-cookie' },
				});

				expect(lines.length).toBeGreaterThan(1);
				expect(lines.join('')).not.toContain('secret-token');
				expect(lines.join('')).not.toContain('secret-cookie');
			});
		},
	);
});
