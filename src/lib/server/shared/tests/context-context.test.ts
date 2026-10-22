import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { provide, withContext, type RupeeContext } from '#lib/server/shared/context/context.ts';
import { createLogger } from '#lib/server/shared/context/logger.ts';
import { logMailer } from '#lib/server/shared/context/mailer.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';
import { localStorage } from '#lib/server/shared/storage/local.ts';

const logger = createLogger('silent', false);

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
			return withContext('config')((c) => c.accounts.signup);
		});
		expect(read).toBe('closed');
	});

	it('throws when nothing was provided', () => {
		expect(() => withContext('mailer')((m) => m)).toThrow('withContext called outside provide');
	});
});
