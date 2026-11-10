import { getRequestEvent } from '$app/server';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setCookie } from '#lib/server/shared/cookies.ts';
import type { User } from './database';

const SESSION = 'session';

const apiUser = new AsyncLocalStorage<User>();

export const runAs = <T>(u: User, f: () => T) => apiUser.run(u, f);

export const requestUser = () => apiUser.getStore() ?? getRequestEvent().locals.user;

export const readSessionCookie = () => getRequestEvent().cookies.get(SESSION);

export const setSessionCookie = (t: string, e: Date) => setCookie(SESSION, t, { expires: e });

export const deleteSessionCookie = () => getRequestEvent().cookies.delete(SESSION, { path: '/' });
