import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from './config';
import { provide, withContext, type RupeeContext } from './context';
import { createLogger } from './logger';
import { logMailer } from './mailer';
import { createModels } from './onnx/runtime';
import { localStorage } from './storage/local';

const logger = createLogger('silent', false);

const context = {
	config: defaultConfiguration,
	db: {} as RupeeContext['db'],
	storages: { local: () => localStorage('/nowhere') },
	models: createModels({
		directory: '/nowhere',
		files: [],
		mode: 'verify',
		logger,
	}),
	mailer: logMailer,
	logger,
} satisfies RupeeContext;

describe('the runtime context', () => {
	it('hands over one dependency by key', () => {
		expect(provide(context, () => withContext('mailer')((m) => m))).toBe(logMailer);
	});

	it('hands over several dependencies as an object', () => {
		const picked = provide(context, () =>
			withContext(
				'config',
				'mailer',
			)(({ config, mailer }) => ({
				config,
				mailer,
			})),
		);
		expect(picked).toEqual({
			config: defaultConfiguration,
			mailer: logMailer,
		});
	});

	it('hands over the whole context with no keys', () => {
		expect(provide(context, () => withContext()((ctx) => ctx))).toBe(context);
	});

	it('follows the context across awaits', async () => {
		const read = await provide(context, async () => {
			await new Promise((res) => setTimeout(res, 1));
			return withContext('config')((c) => c.signup);
		});
		expect(read).toBe('closed');
	});

	it('throws when nothing was provided', () => {
		expect(() => withContext('mailer')((m) => m)).toThrow('withContext called outside provide');
	});
});
