import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context.ts';
import { it } from '#tests/shared/vitest.ts';
import { models as files } from '#lib/server/shared/onnx/models.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';
import { readPdf } from '#services/extraction/adapters/pdf.ts';
import { err } from '#lib/server/shared/result.ts';

const fixture = (n: string) => readFile(join(import.meta.dirname, 'fixtures', n));

const models = files.every(({ file }) => existsSync(join('data/models', file)));

const header = [
	'Date',
	'Narration',
	'Chq./Ref.No.',
	'Value Dt',
	'Withdrawal Amt.',
	'Deposit Amt.',
	'Closing Balance',
];

describe('reading a PDF', () => {
	it.skipIf(!models)(
		'reads every page’s table, wrapped narrations and all',
		async ({ context }) => {
			const read = await provide(context, async () =>
				readPdf({
					name: 'statement.pdf',
					content: await fixture('statement.pdf'),
					password: undefined,
				}),
			);
			if (read.isErr()) throw new Error(read.error.type);
			const rows = read.value.filter((c) => c[0] !== 'Date');
			expect(read.value[0]).toEqual(header);
			expect(rows).toHaveLength(40);
			expect(rows[0]).toEqual([
				'01/08/26',
				'UPI-SHOP 1',
				'000000400001',
				'01/08/26',
				'120.50',
				'',
				'99,879.50',
			]);
			expect(rows[4]?.[1]).toBe('UPI-MERCHANT NUMBER 5-OKAXIS-PAYMENT FOR ORDER 1005');
			expect(rows[6]?.slice(4, 6)).toEqual(['', '50,000.00']);
			expect(rows[39]?.[0]).toBe('12/09/26');
		},
		60_000,
	);

	it.skipIf(!models)(
		'opens a locked PDF with its password',
		async ({ context }) => {
			const content = await fixture('statement-locked.pdf');
			const locked = await provide(context, () => readPdf({ name: 'locked.pdf', content }));
			expect(locked).toEqual(err({ type: 'ExtractionPdfPassword', path: 'locked.pdf', cause: [] }));
			const wrong = await provide(context, () =>
				readPdf({ name: 'locked.pdf', content, password: 'wrong' }),
			);
			expect(wrong).toMatchObject(err({ type: 'ExtractionPdfPassword' }));
			const opened = await provide(context, () =>
				readPdf({ name: 'locked.pdf', content, password: 'secret' }),
			);
			expect(opened.isOk() && opened.value[0]).toEqual(header);
		},
		60_000,
	);

	it('refuses a file that is not a PDF', async ({ context }) => {
		const read = await provide(context, () =>
			readPdf({
				name: 'a.pdf',
				content: new TextEncoder().encode('not a pdf'),
				password: undefined,
			}),
		);
		expect(read).toMatchObject(err({ type: 'CannotReadFile', path: 'a.pdf' }));
	});

	it('says which model is missing', async ({ context }) => {
		const read = await provide(
			{
				...context,
				models: createModels({
					directory: '/nowhere',
					files: files,
					mode: 'verify',
					logger: context.logger,
				}),
			},
			async () =>
				readPdf({
					name: 'statement.pdf',
					content: await fixture('statement.pdf'),
					password: undefined,
				}),
		);
		expect(read).toMatchObject(
			err({
				type: 'ExtractionMissingModel',
				path: '/nowhere/table-detection.onnx',
				cause: [{ type: 'CannotReadFile' }],
			}),
		);
	});
});
