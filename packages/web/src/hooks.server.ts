import { sequence, type Handle } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { createClient } from '#lib/endpoints/api.ts';
import { replyFromCall } from '#lib/endpoints/reply.ts';
import {
	deleteSessionCookie,
	readSessionCookie,
	setSessionCookie,
} from '#lib/endpoints/session.ts';
import { readTheme } from '#lib/web/shared/theme.ts';

const API_URL = process.env['RUPEA_API_URL'] ?? 'http://127.0.0.1:3001/api';

const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const restore = async (event: RequestEvent, token: string | undefined) => {
	const found = await replyFromCall(event.locals.api.auth.findUser());
	const error = found.errors[0];
	const signedOut = error?.type === 'AuthUnauthenticated';

	if (found.data) event.locals.user = found.data.user;
	if (found.data && !token) event.locals.local = true;
	if (token && found.data?.expiresAt) setSessionCookie(token, found.data.expiresAt);
	if (token && signedOut) return deleteSessionCookie();
	if (error && !signedOut) console.error('session validation failed', error);
};

/**
 * Whether the browser runs on this computer, and asked for it by a loopback
 * name rather than a name some site rebound to it.
 */
const fromThisComputer = (e: RequestEvent) =>
	LOOPBACK_ADDRESSES.includes(e.getClientAddress()) && LOOPBACK_HOSTS.includes(e.url.hostname);

const session: Handle = async ({ event, resolve }) => {
	const token = readSessionCookie();
	event.locals.api = createClient({ url: API_URL, token: token ?? null });
	event.locals.user = null;
	event.locals.local = false;
	await restore(event, token);

	if (event.locals.local && !fromThisComputer(event))
		return new Response('Rupea runs without sign-in, so it answers only this computer.', {
			status: 403,
		});

	return resolve(event);
};

const theme: Handle = ({ event, resolve }) => {
	const chosen = readTheme();
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%rupea.theme%', chosen),
	});
};

export const handle = sequence(theme, session);
