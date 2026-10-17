import { createHash } from 'node:crypto';
import { describe, expect, vi } from 'vitest';
import { createLogger } from '#lib/server/shared/context/logger.ts';
import type { ModelFile } from '#lib/server/shared/onnx/download.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';
import { it } from '#tests/shared/vitest.ts';

const bytes = new TextEncoder().encode('a model');

const model: ModelFile = {
	file: 'model.onnx',
	url: 'https://models.test/model.onnx',
	sha256: createHash('sha256').update(bytes).digest('hex'),
};

describe('the models', () => {
	it('are ready once every one is downloaded', async ({ root }) => {
		const fetch = vi.fn(async () => new Response(bytes));
		const models = createModels({
			directory: root,
			files: [model],
			threads: 1,
			mode: 'download',
			logger: createLogger('silent', false),
			fetch,
		});

		expect((await models.ready()).isOk()).toBe(true);
	});

	it('download again after a download failed', async ({ root }) => {
		const fetch = vi
			.fn(async () => new Response(bytes))
			.mockRejectedValueOnce(new Error('offline'));
		const models = createModels({
			directory: root,
			files: [model],
			threads: 1,
			mode: 'download',
			logger: createLogger('silent', false),
			fetch,
		});

		expect((await models.ready()).isErr()).toBe(true);
		expect((await models.ready()).isOk()).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
