import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from '#lib/server/shared/config.ts';
import { provide, type RupeeContext } from '#lib/server/shared/context.ts';
import { withLogger } from '#lib/server/shared/logger.ts';
import { logMailer } from '#lib/server/shared/mailer.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';
import { localStorage } from '#lib/server/shared/storage/local.ts';

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
		db: {} as RupeeContext['db'],
		storages: { local: () => localStorage('/nowhere') },
		models: createModels({
			directory: '/nowhere',
			files: [],
			threads: 1,
			mode: 'verify',
			logger,
		}),
		mailer: logMailer,
		logger: logger.child({ request_id: 'request' }),
	} satisfies RupeeContext;
	return { lines, context };
};

describe('the logger', () => {
	it('tags lines with the namespace and the request', () => {
		const { lines, context } = recording();
		provide(context, () => withLogger('ledger')((l) => l.info('hello')));
		expect(lines).toMatchObject([{ namespace: 'ledger', request_id: 'request', msg: 'hello' }]);
	});
});
