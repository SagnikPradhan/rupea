import { dev } from '$app/env';
import { getRequestEvent } from '$app/server';

const SESSION = 'session';

export const readSessionCookie = () => getRequestEvent().cookies.get(SESSION);

export const setSessionCookie = (token: string, expiresAt: string) =>
	getRequestEvent().cookies.set(SESSION, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: new Date(expiresAt),
	});

export const deleteSessionCookie = () => getRequestEvent().cookies.delete(SESSION, { path: '/' });
