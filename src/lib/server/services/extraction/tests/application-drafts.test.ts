import { provide } from '#lib/server/shared/context/context.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Files from '#services/ledger/application/files.ts';
import { listed } from '#services/ledger/tests/fixtures/files.ts';
import { broken, hashed } from '#tests/shared/embedding.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import * as Drafts from '#services/extraction/application/drafts.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import { models as files } from '#lib/server/shared/onnx/models.ts';
import { bank, day, schema, statement, upload } from './fixtures/bank';

const fixtures = join(import.meta.dirname, 'fixtures');
const models = files.every(({ file }) => existsSync(join('data/models', file)));

describe('extracting a statement', () => {
	it('drafts a ledger file that parses, naming the statement', ({ context, db }) =>
		// Without the model, lines nobody categorised stay uncategorised.
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const { key, checksum } = await upload(ledger);
			const draft = await Drafts.extract({
				ledger,
				statement: key,
				schema: bank,
			});

			expect(draft).toEqual(
				ok({
					key: `_/imports/${day()}/aug.rupea`,
					content: [
						`- statement: ${day()}/aug.csv`,
						`- checksum: ${checksum}`,
						'',
						'2026-08-29 UPI GROCER',
						'\tAssets:Bank',
						'\tExpenses:Food 1250.50',
						'',
						'2026-08-30 SALARY',
						'\tAssets:Bank 50000.00',
						'\tIncome:Uncategorized',
						'',
					].join('\n'),
					failed: [
						{
							type: 'ExtractionInvalidField',
							location: `${day()}/aug.csv:5`,
							field: 'amount',
							reason: '"x" is not a number',
						},
					],
				}),
			);
			if (draft.isErr()) return;
			expect(Files.parseFile({ key: 'aug.rupea', content: draft.value.content })).toMatchObject({
				metadata: { statement: [`${day()}/aug.csv`], checksum: [checksum] },
				failed: [],
			});
		}));

	it('previews a draft with the errors of reading the statement', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const { key } = await upload(ledger, statement);
			const preview = await Drafts.previewStatement({ ledger, statement: key, schema: bank });

			const batch = preview._unsafeUnwrap();
			expect(batch.succeeded.map((t) => t.description)).toEqual(['UPI GROCER', 'SALARY']);
			expect(batch.failed).toMatchObject([{ type: 'ExtractionInvalidField', field: 'amount' }]);
		}));

	it('files uncategorised lines under the accounts the ledger shows', ({ context, db }) =>
		provide({ ...context, models: hashed(context.models) }, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'history.rupea',
				content: [
					'2026-07-30 SALARY',
					'\tAssets:Bank 40000.00',
					'\tIncome:Pay',
					'',
					'2026-06-30 SALARY',
					'\tAssets:Bank 40000.00',
					'\tIncome:Pay',
					'',
				].join('\n'),
			});
			const draft = await Drafts.extract({
				ledger,
				statement: (await upload(ledger)).key,
				schema: bank,
			});

			// The tagged line keeps its tag; the salary follows the ledger.
			expect(draft._unsafeUnwrap().content).toContain(
				['2026-08-30 SALARY', '\tAssets:Bank 50000.00', '\tIncome:Pay'].join('\n'),
			);
			expect(draft._unsafeUnwrap().content).toContain('\tExpenses:Food 1250.50');
		}));

	it('asserts the running balance a statement prints', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const balances = [
				'Date,Narration,Debit,Credit,Tag,Balance',
				'29/08/26,UPI GROCER,"1,250.50",,Expenses:Food,"8,749.50"',
				'30/08/26,SALARY,,"50,000",,',
			].join('\n');
			const draft = await Drafts.extract({
				ledger,
				statement: (await upload(ledger, balances)).key,
				schema: {
					key: 'bank.yml',
					content: `${schema}  balance: { from: [header: Balance], pipe: [number] }\n`,
				},
			});

			expect(draft._unsafeUnwrap().content).toContain(
				['2026-08-29 UPI GROCER', '\tAssets:Bank = 8749.50', '\tExpenses:Food 1250.50'].join('\n'),
			);
			expect(draft._unsafeUnwrap().content).toContain('\tAssets:Bank 50000.00\n');
		}));

	it('needs the schema to name its account', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await Drafts.extract({
					ledger,
					statement: (await upload(ledger)).key,
					schema: { key: 'bank.yml', content: schema.replace('account: Assets:Bank\n', '') },
				}),
			).toMatchObject({ error: { type: 'ExtractionWithoutAccount', path: 'bank.yml' } });
		}));

	it('names the schema when it does not parse', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await Drafts.extract({
					ledger,
					statement: (await upload(ledger)).key,
					schema: { key: 'bank.yml', content: 'version: v2' },
				}),
			).toMatchObject({ error: { type: 'ExtractionInvalidSchema', path: 'bank.yml' } });
		}));
});

describe('saving a draft', () => {
	it('files it and keeps the built-in schema that read it', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const content = await readFile(join(fixtures, 'hdfc-card.xls'));
			const statement = (await upload(ledger, content, 'hdfc-card.xls')).key;
			const recognised = (await Schemas.recogniseStatement({ ledger, statement }))._unsafeUnwrap();
			const saved = await Drafts.importStatement({ ledger, statement, schema: recognised });

			expect(saved).toMatchObject(ok({ key: `_/imports/${day()}/hdfc-card.rupea` }));
			expect(await Schemas.listSchemas(ledger)).toMatchObject(ok([{ key: 'hdfc-card.yml' }]));
		}));

	it('keeps no schema that Rupea does not ship', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const statement = (await upload(ledger)).key;
			await Drafts.importStatement({ ledger, statement, schema: bank });

			expect(await Schemas.listSchemas(ledger)).toEqual(ok([]));
		}));

	it('numbers a draft whose name is taken, and counts none of it until moved out', ({
		context,
		db,
	}) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const statement = (await upload(ledger)).key;
			const taken = `_/imports/${day()}/aug.rupea`;
			await Files.createFile({ ledger, key: taken, content: '' });
			const saved = await Drafts.importStatement({ ledger, statement, schema: bank });
			const again = await Drafts.importStatement({ ledger, statement, schema: bank });
			const key = `_/imports/${day()}/aug-02.rupea`;

			expect(saved).toMatchObject(ok({ key }));
			expect(again).toMatchObject(ok({ key }));
			expect(await listed(ledger)).toEqual([]);

			await Files.deleteFiles({ ledger, keys: [taken] });
			await Files.renameFiles({ ledger, moves: [{ from: key, to: 'bank/aug.rupea' }] });
			expect(await listed(ledger)).toMatchObject([
				{ description: 'SALARY' },
				{ description: 'UPI GROCER' },
			]);
		}));
});

describe('a statement a built-in schema reads', () => {
	const banks = [
		{ file: 'hdfc-savings.xls', schema: 'hdfc-savings.yml', records: 20 },
		{ file: 'hdfc-card.xls', schema: 'hdfc-card.yml', records: 9 },
		{ file: 'idfc-card.pdf', schema: 'idfc-card.yml', records: 3 },
		{ file: 'idfc-card-2026.pdf', schema: 'idfc-card-2026.yml', records: 3 },
		{ file: 'sbi-savings.pdf', schema: 'sbi-savings.yml', records: 12 },
	];

	it.for(banks)(
		'$file imports into a fresh ledger with no edits',
		async ({ file, schema, records }, { context, db, skip }) => {
			if (file.endsWith('.pdf') && !models) skip();

			await provide(context, async () => {
				const ledger = await createLedger(db);
				const content = await readFile(join(fixtures, file));
				const key = (await upload(ledger, content, file)).key;

				const recognised = (
					await Schemas.recogniseStatement({ ledger, statement: key })
				)._unsafeUnwrap();
				const draft = (
					await Drafts.extract({ ledger, statement: key, schema: recognised })
				)._unsafeUnwrap();
				const checked = Files.parseFile({ key: draft.key, content: draft.content });

				expect(recognised).toMatchObject({ key: schema, builtin: true });
				expect(draft.failed).toEqual([]);
				expect(checked.failed).toEqual([]);
				expect(checked.succeeded).toHaveLength(records);
			});
		},
	);
});
