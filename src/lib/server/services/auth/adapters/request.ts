import { getRequestEvent } from '$app/server';
import { setCookie } from '#lib/server/shared/cookies.ts';

const SESSION = 'session';

export const requestUser = () => getRequestEvent().locals.user;

export const readSessionCookie = () => getRequestEvent().cookies.get(SESSION);

export const setSessionCookie = (t: string, e: Date) => setCookie(SESSION, t, { expires: e });

export const deleteSessionCookie = () => getRequestEvent().cookies.delete(SESSION, { path: '/' });
