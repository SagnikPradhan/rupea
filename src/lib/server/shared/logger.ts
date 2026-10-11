import { createRequire } from 'node:module';
import { pino, type Logger, type LevelWithSilent } from 'pino';
import { withContext } from './context';

export type { Logger };

export type Namespace = 'auth' | 'ledger' | 'mailer' | 'onnx' | 'prediction';

export const createLogger = (level: LevelWithSilent, pretty: boolean) =>
	pino({
		level,
		...(pretty && {
			transport: {
				// Under pnpm, pino cannot resolve pino-pretty from its own directory.
				target: createRequire(import.meta.url).resolve('pino-pretty'),
			},
		}),
	});

export const withLogger =
	(ns: Namespace) =>
	<R>(u: (logger: Logger) => R): R =>
		withContext('logger')((l) => u(l.child({ namespace: ns })));
