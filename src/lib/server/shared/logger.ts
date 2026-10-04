/**
 * Structured logging with pino. The context carries one root logger;
 * `hooks.server.ts` swaps in a child per request so every line it logs
 * carries that request's `request_id`. Code logs through `withLogger`, which
 * also tags each line with the `namespace` it came from:
 *
 * ```ts
 * withLogger('auth')((logger) => logger.info('signed in'));
 * ```
 */
import { createRequire } from 'node:module';
import { pino, type Logger, type LevelWithSilent } from 'pino';
import { withContext } from './context';

export type { Logger };

/** One per service, plus the shared infrastructure that logs on its own. */
export type Namespace = 'auth' | 'ledger' | 'mailer' | 'onnx';

/**
 * `pretty` sends lines through pino-pretty (a dev dependency). It is resolved
 * from here because pino, under pnpm, cannot see it from its own directory.
 */
export const createLogger = (level: LevelWithSilent, pretty: boolean) =>
	pino({
		level,
		...(pretty && {
			transport: {
				target: createRequire(import.meta.url).resolve('pino-pretty'),
			},
		}),
	});

/** Like `withContext('logger')`, with the logger tagged with `namespace`. */
export const withLogger =
	(ns: Namespace) =>
	<R>(u: (logger: Logger) => R): R =>
		withContext('logger')((l) => u(l.child({ namespace: ns })));
