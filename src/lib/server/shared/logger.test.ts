import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from './config';
import { provide, type RupeeContext } from './context';
import { withLogger } from './logger';
import { logMailer } from './mailer';
import { localStorage } from './storage/local';
import { createModels } from './onnx/runtime';

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
		storage: localStorage('/nowhere'),
		models: createModels({
			directory: '/nowhere',
			files: [],
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
