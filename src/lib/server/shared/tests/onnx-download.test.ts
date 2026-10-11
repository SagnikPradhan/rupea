import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, vi } from 'vitest';
import { createLogger } from '#lib/server/shared/logger.ts';
import { err, ok } from '#lib/server/shared/result.ts';
import { it } from '#tests/shared/vitest.ts';
import {
	ensure,
	prepare,
	type ModelFile,
	type ModelMode,
} from '#lib/server/shared/onnx/download.ts';

const bytes = new TextEncoder().encode('a model');

const model: ModelFile = {
	file: 'model.onnx',
	url: 'https://models.test/model.onnx',
	sha256: createHash('sha256').update(bytes).digest('hex'),
};

const options = (mode: ModelMode, response: () => Response) => ({
	mode,
	logger: createLogger('silent', false),
	fetch: vi.fn(async () => response()),
});

describe('making sure of a model', () => {
	it('keeps a model already there and intact', async ({ root }) => {
		await writeFile(join(root, model.file), bytes);
		const download = options('download', () => new Response(bytes));
		expect(await ensure({ directory: root, model, ...download })).toEqual(
			ok(join(root, model.file)),
		);
		expect(download.fetch).not.toHaveBeenCalled();
	});

	it('downloads a missing model', async ({ root }) => {
		const path = join(root, model.file);
		expect(
			await ensure({
				directory: root,
				model,
				...options('download', () => new Response(bytes)),
			}),
		).toEqual(ok(path));
		expect(await readFile(path)).toEqual(Buffer.from(bytes));
		expect(await readdir(root)).toEqual([model.file]);
	});

	it('refuses a download that is not the pinned revision', async ({ root }) => {
		const ensured = await ensure({
			directory: root,
			model,
			...options('download', () => new Response('another model')),
		});
		expect(ensured).toMatchObject(
			err({
				type: 'ExtractionMissingModel',
				path: join(root, model.file),
				cause: [{ type: 'ModelHashMismatch', expected: model.sha256 }],
			}),
		);
		expect(await readdir(root)).toEqual([]);
	});

	it('says why a download failed', async ({ root }) => {
		const ensured = await ensure({
			directory: root,
			model,
			...options('download', () => new Response(null, { status: 404 })),
		});
		expect(ensured).toEqual(
			err({
				type: 'ExtractionMissingModel',
				path: join(root, model.file),
				cause: [
					{
						type: 'ModelDownloadFailed',
						url: model.url,
						status: 404,
						cause: [],
					},
				],
			}),
		);
		expect(await readdir(root)).toEqual([]);
	});

	it('never downloads when only verifying', async ({ root }) => {
		const verify = options('verify', () => new Response(bytes));
		expect(await ensure({ directory: root, model, ...verify })).toMatchObject(
			err({
				type: 'ExtractionMissingModel',
				path: join(root, model.file),
				cause: [{ type: 'CannotReadFile', path: join(root, model.file) }],
			}),
		);
		await writeFile(join(root, model.file), 'another model');
		expect(await ensure({ directory: root, model, ...verify })).toMatchObject(
			err({ cause: [{ type: 'ModelHashMismatch' }] }),
		);
		expect(verify.fetch).not.toHaveBeenCalled();
	});
});

describe('readying the models directory', () => {
	it('removes interrupted downloads', async ({ root }) => {
		await writeFile(join(root, model.file), bytes);
		await writeFile(join(root, `${model.file}.1234.part`), 'half a model');
		expect(await prepare(root)).toEqual(ok(undefined));
		expect(await readdir(root)).toEqual([model.file]);
	});
});
