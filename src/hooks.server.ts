import { dev } from '$app/env';
import { randomUUID } from 'node:crypto';
import { sequence, type Handle, type ServerInit } from '@sveltejs/kit/hooks';
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
import { readTheme } from '#lib/server/shared/theme.ts';
import { startServerWorkers } from '#lib/server/workers.ts';

const config = readConfiguration(process.env);
const database = await createDatabase(config);
const context = createContext(config, database.orm, dev);

export const init: ServerInit = async () => {
	await database.migrate();
	const workers = await startServerWorkers({ database: database.url, context, dev });
	if (!import.meta.hot)
		process.once('sveltekit:shutdown', () => workers.stop().then(database.close));
};

const session: Handle = ({ event, resolve }) =>
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

const theme: Handle = ({ event, resolve }) => {
	const chosen = readTheme();
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%rupee.theme%', chosen),
	});
};

export const handle = sequence(theme, session);
