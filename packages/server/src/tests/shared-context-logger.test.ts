import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { provide, type RupeaContext } from '#lib/server/shared/context/context.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { logMailer } from '#lib/server/shared/context/mailer.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';
import { localStorage } from '#lib/server/shared/storage/local.ts';
import { byUser } from '#lib/server/shared/storage/storage.ts';

const recording = () => {
	const lines: Record<string, unknown>[] = [];
	const logger = pino(
		{},
		{
			write: (l) => void lines.push(JSON.parse(l)),
		},
	);
	const context = {
		config: defaultConfiguration,
		db: {} as RupeaContext['db'],
		storages: { local: byUser(localStorage('/nowhere')) },
		subscriptions: [],
		models: createModels({
			directory: '/nowhere',
			files: [],
			threads: 1,
			mode: 'verify',
			logger,
		}),
		mailer: logMailer,
		fetch: globalThis.fetch,
		logger: logger.child({ request_id: 'request' }),
	} satisfies RupeaContext;
	return { lines, context };
};

describe('the logger', () => {
	it('tags lines with the namespace and the request', () => {
		const { lines, context } = recording();
		provide(context, () => withLogger('ledger')((l) => l.info('hello')));
		expect(lines).toMatchObject([{ namespace: 'ledger', request_id: 'request', msg: 'hello' }]);
	});
});
