import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import { it } from '#tests/shared/vitest.ts';
import { models as files } from '#lib/server/shared/onnx/models.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';
import { readPdf } from '#services/extraction/adapters/reader-pdf.ts';
import { err } from '#lib/server/shared/result/result.ts';
import { PDFDocument } from '@cantoo/pdf-lib';

const models = files.every(({ file }) => existsSync(join('data/models', file)));

const plain = () => readFile(join(import.meta.dirname, 'fixtures/sbi-savings.pdf'));

const locked = async () => {
	const document = await plain().then((b) => PDFDocument.load(b));
	document.encrypt({ userPassword: 'secret', ownerPassword: 'secret' });
	return document.save();
};

const first = [
	'16/02/2026',
	'16/02/2026',
	'DEP TFR UPI/CR/510000000001/ARUN',
	'-',
	'-',
	'64,000.00',
	'2,46,340.55',
];

describe('reading a PDF', () => {
	it.skipIf(!models)(
		'reads every page’s table, wrapped narrations and all',
		async ({ context }) => {
			const read = await provide(context, async () =>
				readPdf({ name: 'a.pdf', content: await plain(), password: undefined }),
			);
			if (read.isErr()) throw new Error(read.error.type);
			const grid = read.value.grid;
			const dated = grid.filter((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c[0] ?? ''));
			expect(grid.filter((c) => c[6] === 'Balance')).toHaveLength(2);
			expect(read.value.text).toContain('STATEMENT OF ACCOUNT');

			expect(dated).toHaveLength(12);
			expect(dated[0]).toEqual(first);
			expect(grid[2]?.[2]).toBe('P/HDFC/arun.kumar/Self');
			expect(dated[11]?.[0]).toBe('27/04/2026');
		},
	);

	it.skipIf(!models)('opens a locked PDF with its password', async ({ context }) => {
		const content = await locked();
		const unasked = await provide(context, () => readPdf({ name: 'locked.pdf', content }));
		expect(unasked).toEqual(err({ type: 'ExtractionLocked', path: 'locked.pdf' }));
		const wrong = await provide(context, () =>
			readPdf({ name: 'locked.pdf', content, password: 'wrong' }),
		);
		expect(wrong).toMatchObject({ error: { type: 'ExtractionLocked' } });
		const opened = await provide(context, () =>
			readPdf({ name: 'locked.pdf', content, password: 'secret' }),
		);
		expect(opened.isOk() && opened.value.grid[1]).toEqual(first);
	});

	it('refuses a file that is not a PDF', async ({ context }) => {
		const read = await provide(context, () =>
			readPdf({
				name: 'a.pdf',
				content: new TextEncoder().encode('not a pdf'),
				password: undefined,
			}),
		);
		expect(read).toMatchObject({ error: { type: 'CannotReadFile', path: 'a.pdf' } });
	});

	it('says which model is missing', async ({ context }) => {
		const read = await provide(
			{
				...context,
				models: createModels({
					directory: '/nowhere',
					files: files,
					threads: 1,
					mode: 'verify',
					logger: context.logger,
				}),
			},
			async () => readPdf({ name: 'a.pdf', content: await plain(), password: undefined }),
		);
		expect(read).toMatchObject({
			error: {
				type: 'ExtractionMissingModel',
				path: '/nowhere/table-detection.onnx',
				cause: [{ type: 'CannotReadFile' }],
			},
		});
	});
});
