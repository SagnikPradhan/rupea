import { ORPCError } from '@orpc/client';
import { requestCode, signOut, verifyCode } from '#lib/endpoints/auth.remote.ts';
import { toggleTheme } from '#lib/endpoints/theme.remote.ts';
import { request, submit, useApi } from '#tests/shared/app-server.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

afterEach(() => {
	vi.restoreAllMocks();
	request.cookies.clear();
	request.cookieOptions.clear();
});

const refused = (status: number, data?: object) =>
	new ORPCError('REFUSED', { status, defined: true, data });

const expiresAt = '2026-12-01T10:00:00Z';

describe('signing in', () => {
	it('mails a code to the normalised address', async () => {
		const mailed = vi.fn().mockResolvedValue(undefined);
		useApi({ requestCode: mailed });

		const asked = await submit(requestCode, { email: ' Ada@Example.com ' });

		expect(mailed).toHaveBeenCalledWith({ email: 'ada@example.com' });
		expect(asked).toEqual({ ok: true, data: { email: 'ada@example.com' }, errors: [] });
	});

	it('keeps the token in a cookie and goes home', async () => {
		const signIn = vi.fn().mockResolvedValue({ token: 'opaque', expiresAt });
		useApi({ signIn });

		await expect(
			submit(verifyCode, { email: 'ada@example.com', code: ' 123456 ' }),
		).rejects.toMatchObject({ status: 303, location: '/' });

		expect(signIn).toHaveBeenCalledWith({ email: 'ada@example.com', code: '123456' });
		expect(request.cookies.get('session')).toBe('opaque');
		expect(request.cookieOptions.get('session')).toMatchObject({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: new Date(expiresAt),
		});
	});

	it('marks a wrong code on its field', async () => {
		useApi({ signIn: () => Promise.reject(refused(401, { type: 'AuthInvalidCode' })) });

		await expect(
			submit(verifyCode, { email: 'ada@example.com', code: '000000' }),
		).rejects.toMatchObject({ issues: [{ message: 'That code is wrong or has expired.' }] });
		expect(request.cookies.has('session')).toBe(false);
	});

	it('replies with any other failure and sets no cookie', async () => {
		useApi({ signIn: () => Promise.reject(new TypeError('fetch failed')) });

		const reply = await submit(verifyCode, { email: 'ada@example.com', code: '123456' });

		expect(reply).toEqual({
			ok: false,
			data: null,
			errors: [{ type: 'UnknownError', message: 'fetch failed' }],
		});
		expect(request.cookies.has('session')).toBe(false);
	});
});

describe('signing out', () => {
	it('ends the session of the cookie and goes to the sign-in page', async () => {
		const ended = vi.fn().mockResolvedValue(undefined);
		useApi({ signOut: ended });
		request.cookies.set('session', 'opaque');

		await expect(submit(signOut)).rejects.toMatchObject({ status: 303, location: '/sign-in' });

		expect(ended).toHaveBeenCalledOnce();
		expect(request.cookies.has('session')).toBe(false);
	});

	it('does not call the API without a cookie', async () => {
		const ended = vi.fn();
		useApi({ signOut: ended });

		await expect(submit(signOut)).rejects.toMatchObject({ status: 303, location: '/sign-in' });

		expect(ended).not.toHaveBeenCalled();
	});

	it('logs a failure, drops the cookie and redirects', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		useApi({ signOut: () => Promise.reject(new TypeError('connection refused')) });
		request.cookies.set('session', 'stuck');

		await expect(submit(signOut)).rejects.toMatchObject({ status: 303, location: '/sign-in' });

		expect(request.cookies.has('session')).toBe(false);
		expect(logged).toHaveBeenCalledWith(
			'sign-out failed',
			expect.objectContaining({ type: 'UnknownError' }),
		);
	});

	it('stays quiet when the session had already ended', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		useApi({ signOut: () => Promise.reject(refused(401, { type: 'AuthUnauthenticated' })) });
		request.cookies.set('session', 'old');

		await expect(submit(signOut)).rejects.toMatchObject({ status: 303 });

		expect(logged).not.toHaveBeenCalled();
	});
});

describe('the theme', () => {
	it('cycles from the system one through light and dark', async () => {
		expect(await submit(toggleTheme)).toBe('light');
		expect(await submit(toggleTheme)).toBe('dark');
		expect(await submit(toggleTheme)).toBe('system');
	});
});
