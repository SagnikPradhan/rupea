import { randomUUID } from 'node:crypto';
import type { Handle } from '@sveltejs/kit/hooks';
import { validateSession } from '#lib/server/services/auth/application/auth.ts';
import {
	deleteSessionCookie,
	readSessionCookie,
	setSessionCookie,
} from '#lib/server/services/auth/adapters/cookie.ts';
import { provide } from '#lib/server/shared/context.ts';
import { createContext } from '#lib/server/shared/environment.ts';
import { withLogger } from '#lib/server/shared/logger.ts';

/** The composition root: the one place the context is built. */
const context = createContext();

/**
 * Run every request inside the context, with a logger tagged for it, resolving
 * the signed-in user.
 */
export const handle: Handle = ({ event, resolve }) =>
	provide({ ...context, logger: context.logger.child({ request_id: randomUUID() }) }, async () => {
		const token = readSessionCookie();
		event.locals.user = null;
		if (!token) return resolve(event);

		await validateSession(token).match(
			(session) => {
				if (!session) return deleteSessionCookie();
				event.locals.user = session.user;
				setSessionCookie(token, session.expiresAt);
			},
			(err) => withLogger('auth')((l) => l.error({ error: err }, 'session validation failed')),
		);
		return resolve(event);
	});
