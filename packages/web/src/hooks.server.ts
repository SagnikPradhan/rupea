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

const restore = async (event: RequestEvent, token: string) => {
	const found = await replyFromCall(event.locals.api.auth.findUser());
	const error = found.errors[0];

	if (found.data) event.locals.user = found.data.user;
	if (found.data?.expiresAt) setSessionCookie(token, found.data.expiresAt);
	if (error?.type === 'AuthUnauthenticated') return deleteSessionCookie();
	if (error) console.error('session validation failed', error);
};

const session: Handle = async ({ event, resolve }) => {
	const token = readSessionCookie();
	event.locals.api = createClient({ url: API_URL, token: token ?? null });
	event.locals.user = null;
	if (token) await restore(event, token);

	return resolve(event);
};

const theme: Handle = ({ event, resolve }) => {
	const chosen = readTheme();
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%rupea.theme%', chosen),
	});
};

export const handle = sequence(theme, session);
