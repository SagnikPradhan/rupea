import { getRequestEvent } from '$app/server';
import { setCookie } from '#lib/server/shared/cookies.ts';

const NAME = 'session';

export const readSessionCookie = () => getRequestEvent().cookies.get(NAME);

export const setSessionCookie = (t: string, e: Date) => setCookie(NAME, t, { expires: e });

export const deleteSessionCookie = () => getRequestEvent().cookies.delete(NAME, { path: '/' });
