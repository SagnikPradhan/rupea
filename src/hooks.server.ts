import { dev } from '$app/env';
import { randomUUID } from 'node:crypto';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { validateSession } from '#services/auth/application/auth.ts';
import {
	deleteSessionCookie,
	readSessionCookie,
	setSessionCookie,
} from '#services/auth/adapters/cookie.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { createContext, createDatabase } from '#lib/server/shared/context/environment.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { readConfiguration } from '#lib/server/shared/context/config.ts';

const config = readConfiguration(process.env);
const database = await createDatabase(config);
const context = createContext(config, database.orm, dev);

export const init: ServerInit = () => database.migrate();

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
