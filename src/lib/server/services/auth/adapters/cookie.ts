import { dev } from '$app/env';
import { getRequestEvent } from '$app/server';

const NAME = 'session';

export const readSessionCookie = () => getRequestEvent().cookies.get(NAME);

export const setSessionCookie = (token: string, expiresAt: Date) =>
	getRequestEvent().cookies.set(NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: expiresAt,
	});

export const deleteSessionCookie = () => getRequestEvent().cookies.delete(NAME, { path: '/' });
