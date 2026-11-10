import { requestCode, signOut, verifyCode } from '#lib/endpoints/auth.remote.ts';
import { toggleTheme } from '#lib/endpoints/theme.remote.ts';
import { provide } from '@rupea/server/shared/context/context.ts';
import type { Mail } from '@rupea/server/shared/context/mailer.ts';
import { okAsync } from '@rupea/server/shared/result/result.ts';
import { request, submit } from '#tests/shared/app-server.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { pino } from 'pino';
import { afterEach, describe, expect, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

afterEach(() => {
	request.cookies.clear();
	request.cookieOptions.clear();
});

const inbox = () => {
	const sent: Mail[] = [];
	const mailer = {
		send: (mail: Mail) => {
			sent.push(mail);
			return okAsync();
		},
	};
	return { sent, mailer };
};

const codeIn = (mail: Mail | undefined) => mail?.subject.match(/(\d{6})$/)?.[1] ?? '';

describe('signing in', () => {
	it('mails a code to the normalised address, which then signs in', ({ context }) => {
		const { sent, mailer } = inbox();
		return provide({ ...context, mailer }, async () => {
			const asked = await submit(requestCode, { email: ' Ada@Example.com ' });
			expect(asked).toEqual({ ok: true, data: { email: 'ada@example.com' }, errors: [] });

			const code = codeIn(sent[0]);
			await expect(submit(verifyCode, { email: 'ada@example.com', code })).rejects.toMatchObject({
				status: 303,
				location: '/',
			});
			expect(request.cookies.has('session')).toBe(true);
			expect(request.cookieOptions.get('session')).toMatchObject({
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				expires: expect.any(Date),
			});
		});
	});

	it('marks a wrong code on its field', ({ context }) => {
		const { mailer } = inbox();
		return provide({ ...context, mailer }, async () => {
			await submit(requestCode, { email: 'ada@example.com' });
			await expect(
				submit(verifyCode, { email: 'ada@example.com', code: '000000' }),
			).rejects.toMatchObject({ issues: [{ message: 'That code is wrong or has expired.' }] });
		});
	});

	it('signs out back to the sign-in page', ({ context }) =>
		provide(context, async () => {
			request.cookies.set('session', 'stale');
			await expect(submit(signOut)).rejects.toMatchObject({ status: 303, location: '/sign-in' });
			expect(request.cookies.has('session')).toBe(false);
		}));
});

describe('signing out when the session cannot be deleted', () => {
	it('logs the failure, drops the cookie and redirects', ({ context, db }) => {
		const lines: string[] = [];
		const logger = pino({ level: 'error' }, { write: (line: string) => lines.push(line) });
		return provide({ ...context, logger }, async () => {
			request.cookies.set('session', 'stuck');
			const failing = vi.spyOn(db, 'deleteFrom').mockImplementation(() => {
				throw new Error('database down');
			});

			await expect(submit(signOut)).rejects.toMatchObject({ status: 303, location: '/sign-in' });
			failing.mockRestore();

			expect(request.cookies.has('session')).toBe(false);
			expect(lines.join('')).toContain('sign-out failed');
		});
	});
});

describe('the theme', () => {
	it('cycles from the system one through light and dark', async () => {
		expect(await submit(toggleTheme)).toBe('light');
		expect(await submit(toggleTheme)).toBe('dark');
		expect(await submit(toggleTheme)).toBe('system');
	});
});
