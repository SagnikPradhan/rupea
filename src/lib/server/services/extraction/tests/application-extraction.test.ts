import { statementGrids } from '#lib/server/db/schema.ts';
import { provide } from '#lib/server/shared/context.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { broken, hashed } from '#tests/shared/embedding.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { it } from '#tests/shared/vitest.ts';
import { builtinSchemas } from '#services/extraction/adapters/builtin.ts';
import { inArray } from 'drizzle-orm';
import officeCrypto from 'officecrypto-tool';
import * as XLSX from 'xlsx';
import { describe, expect } from 'vitest';
import * as Extraction from '#services/extraction/application/extraction.ts';
import { models as files } from '#lib/server/shared/onnx/models.ts';

const schema = `version: v1
name: Bank
match:
  - regex: ^Account statement$
account: Assets:Bank
header:
  text: Narration
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yy] }
  description: { from: [header: Narration] }
  amount:
    - from: [header: Debit]
      pipe: [number, negate]
    - from: [header: Credit]
      pipe: [number]
  category: { from: [header: Tag] }
`;

const statement = [
	'Account statement',
	'Date,Narration,Debit,Credit,Tag',
	'29/08/26,UPI GROCER,"1,250.50",,Expenses:Food',
	'30/08/26,SALARY,,"50,000",',
	'31/08/26,ODD,x,,',
].join('\n');

const fixtures = join(import.meta.dirname, 'fixtures');
const models = files.every(({ file }) => existsSync(join('data/models', file)));
const sha256 = (c: Uint8Array) => `sha256:${createHash('sha256').update(c).digest('hex')}`;

const encode = (text: string) => new TextEncoder().encode(text);

const lockedSheet = async () => {
	const book = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Date', 'Narration']]));
	const plain = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
	return new Uint8Array(await officeCrypto.encrypt(plain, { password: 'secret' }));
};

const read = async (ledger: Ledger.Ledger, text = statement, name = 'aug.csv') =>
	(await Extraction.readStatement(ledger, { name, content: encode(text) }))._unsafeUnwrap();

const bank = { key: 'bank.yml', content: schema };

// Where a ledger's folders are, in a storage holding every user's.
const folder = (l: Ledger.Ledger) => `users/${l.owner}/ledgers/${l.handle}`;

describe('reading a statement', () => {
	it("keeps it in its ledger's statements", ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const read1 = await read(ledger);

			expect(read1).toMatchObject({ key: 'aug.csv', checksum: expect.stringMatching(/^sha256:/) });
			expect(read1.grid[1]).toEqual(['Date', 'Narration', 'Debit', 'Credit', 'Tag']);
			expect((await storage.read(`${folder(ledger)}/statements/aug.csv`)).isOk()).toBe(true);
		}));

	it('keeps one copy of the same statement, and numbers another of the same name', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const first = await read(ledger);
			const again = await read(ledger);
			const other = await read(ledger, `${statement}\n`);

			expect(again).toEqual(first);
			expect(other.key).toBe('aug (2).csv');
			expect(other.checksum).not.toBe(first.checksum);
		}));

	it('finds content the ledger already has, under any name', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const first = await read(ledger);
			const renamed = await read(ledger, statement, 'renamed.csv');

			expect(renamed).toEqual(first);
		}));

	it('keeps a locked statement, and replaces it with its content unlocked', ({
		context,
		db,
		storage,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = await lockedSheet();
			const locked = await Extraction.readStatement(ledger, { name: 'aug.xlsx', content });
			expect(locked).toMatchObject({ error: { type: 'ExtractionLocked', path: 'aug.xlsx' } });

			const unlocked = await Extraction.unlockStatement({
				ledger,
				statement: 'aug.xlsx',
				password: 'secret',
			});
			const stored = await storage.read(`${folder(ledger)}/statements/aug.xlsx`);

			expect(unlocked._unsafeUnwrap()).toMatchObject({
				key: 'aug.xlsx',
				original: sha256(content),
			});
			expect(unlocked._unsafeUnwrap().grid[0]).toEqual(['Date', 'Narration']);
			expect([...stored._unsafeUnwrap().content.subarray(0, 2)]).toEqual([0x50, 0x4b]);
		}));

	it('finds a statement it unlocked when the locked one comes again', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = await lockedSheet();
			await Extraction.readStatement(ledger, { name: 'aug.xlsx', content });
			await Extraction.unlockStatement({ ledger, statement: 'aug.xlsx', password: 'secret' });
			const again = await Extraction.readStatement(ledger, { name: 'sep.xlsx', content });

			expect(again._unsafeUnwrap()).toMatchObject({ key: 'aug.xlsx', original: sha256(content) });
		}));

	it('reads a statement the table does not know yet, and records it', ({ context, db, storage }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const content = encode(statement);
			await storage.write({ key: `${folder(ledger)}/statements/aug.csv`, content });
			const draft = await Extraction.extract({ ledger, statement: 'aug.csv', schema: bank });

			expect(draft._unsafeUnwrap().content).toContain(`- checksum: ${sha256(content)}`);
		}));

	it('keeps nothing it cannot read', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const unread = await Extraction.readStatement(ledger, {
				name: 'aug.txt',
				content: encode(statement),
			});

			expect(unread).toMatchObject({ error: { type: 'ExtractionUnsupportedFile' } });
			expect((await storage.read(`${folder(ledger)}/statements/aug.txt`)).isErr()).toBe(true);
		}));
});

describe('extracting a statement', () => {
	it('drafts a ledger file that parses, citing the statement', ({ context, db }) =>
		// Without the model, lines nobody categorised stay uncategorised.
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const { key, checksum } = await read(ledger);
			const draft = await Extraction.extract({
				ledger,
				statement: key,
				schema: bank,
			});

			expect(draft).toEqual(
				ok({
					key: 'imports/aug.rupee',
					content: [
						'- statement: aug.csv',
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
							location: 'aug.csv:5',
							field: 'amount',
							reason: '"x" is not a number',
						},
					],
				}),
			);
			if (draft.isErr()) return;
			expect(Ledger.check('aug.rupee', draft.value.content)).toMatchObject({
				metadata: { statement: ['aug.csv'], checksum: [checksum] },
				failed: [],
			});
		}));

	it('files uncategorised lines under the accounts the ledger shows', ({ context, db }) =>
		provide({ ...context, models: hashed(context.models) }, async () => {
			const ledger = await createLedger(db);
			await Ledger.createFile({
				ledger,
				key: 'history.rupee',
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
			const draft = await Extraction.extract({
				ledger,
				statement: (await read(ledger)).key,
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
			const draft = await Extraction.extract({
				ledger,
				statement: (await read(ledger, balances)).key,
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
				await Extraction.extract({
					ledger,
					statement: (await read(ledger)).key,
					schema: { key: 'bank.yml', content: schema.replace('account: Assets:Bank\n', '') },
				}),
			).toMatchObject({ error: { type: 'ExtractionWithoutAccount', path: 'bank.yml' } });
		}));

	it('names the schema when it does not parse', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await Extraction.extract({
					ledger,
					statement: (await read(ledger)).key,
					schema: { key: 'bank.yml', content: 'version: v2' },
				}),
			).toMatchObject({ error: { type: 'ExtractionInvalidSchema', path: 'bank.yml' } });
		}));

	it('reads the stored statement again once its grid expired', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const { key } = await read(ledger);
			await db.update(statementGrids).set({ expiresAt: new Date(0) });

			const draft = await Extraction.extract({
				ledger,
				statement: key,
				schema: bank,
			});

			expect(draft._unsafeUnwrap().content).toContain('UPI GROCER');
			const [cached] = await db.select().from(statementGrids);
			expect(cached?.expiresAt.getTime()).toBeGreaterThan(Date.now());
		}));

	it('sweeps expired grids when it caches another', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const aug = await read(ledger);
			await db.update(statementGrids).set({ expiresAt: new Date(0) });
			const sep = await read(ledger, `${statement}\nsep`, 'sep.csv');

			const cached = await db
				.select({ checksum: statementGrids.checksum })
				.from(statementGrids)
				.where(inArray(statementGrids.checksum, [aug.checksum, sep.checksum]));
			expect(cached).toEqual([{ checksum: sep.checksum }]);
		}));
});

describe('recognising a statement', () => {
	it("finds the ledger's schema that matches it", ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Extraction.saveSchema({ ledger, ...bank });
			await Extraction.saveSchema({
				ledger,
				key: 'other.yml',
				content: schema.replace('^Account statement$', '^Other bank$'),
			});

			expect(await Extraction.recogniseStatement(ledger, (await read(ledger)).key)).toEqual(
				ok({ ...bank, builtin: false }),
			);
		}));

	it('says so when none does', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(await Extraction.recogniseStatement(ledger, (await read(ledger)).key)).toMatchObject({
				error: { type: 'ExtractionUnrecognised', path: 'aug.csv' },
			});
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
				const read = await Extraction.readStatement(ledger, { name: file, content });
				const key = read._unsafeUnwrap().key;

				const recognised = (await Extraction.recogniseStatement(ledger, key))._unsafeUnwrap();
				const draft = (
					await Extraction.extract({ ledger, statement: key, schema: recognised })
				)._unsafeUnwrap();
				const checked = Ledger.check(draft.key, draft.content);

				expect(recognised).toMatchObject({ key: schema, builtin: true });
				expect(draft.failed).toEqual([]);
				expect(checked.failed).toEqual([]);
				expect(checked.succeeded).toHaveLength(records);
			});
		},
	);

	const builtin = (key: string) => ({
		key,
		content: builtinSchemas().find((s) => s.key === key)?.content ?? '',
	});

	it('keeps its schema in the ledger once imported, as it was', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const hdfc = builtin('hdfc-card.yml');
			const sbi = builtin('sbi-savings.yml');
			await Extraction.keepSchema(ledger, hdfc);
			await Extraction.keepSchema(ledger, { key: sbi.key, content: `${sbi.content}# edited\n` });
			await Extraction.keepSchema(ledger, bank);

			const kept = (await Extraction.listSchemas(ledger))._unsafeUnwrap().map((e) => e.key);
			expect(kept).toEqual(['hdfc-card.yml']);
			expect(await Extraction.readSchema(ledger, hdfc.key)).toMatchObject(
				ok({ content: hdfc.content }),
			);
		}));

	it("leaves the ledger's own schema of the same name alone", ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const hdfc = builtin('hdfc-card.yml');
			await Extraction.saveSchema({ ledger, key: hdfc.key, content: schema });
			await Extraction.keepSchema(ledger, hdfc);

			expect(await Extraction.readSchema(ledger, hdfc.key)).toMatchObject(ok({ content: schema }));
		}));
});

describe('statement schemas', () => {
	it('are saved, listed and read back', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Extraction.saveSchema({ ledger, key: 'bank.yml', content: schema });
			expect(await Extraction.listSchemas(ledger)).toMatchObject(ok([{ key: 'bank.yml' }]));
			expect(await Extraction.readSchema(ledger, 'bank.yml')).toMatchObject(
				ok({ content: schema }),
			);
		}));

	it('are refused when they do not parse', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await Extraction.saveSchema({ ledger, key: 'bad.yml', content: 'version: v2' }),
			).toMatchObject({ error: { type: 'ExtractionInvalidSchema', path: 'bad.yml' } });
			expect(await Extraction.listSchemas(ledger)).toEqual(ok([]));
		}));

	it("live in their ledger's folder, apart from other ledgers'", ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const other = await createLedger(db);
			await Extraction.saveSchema({ ledger, key: 'bank.yml', content: schema });

			expect((await storage.read(`${folder(ledger)}/schemas/bank.yml`)).isOk()).toBe(true);
			expect(await Extraction.listSchemas(other)).toEqual(ok([]));
		}));

	it('are deleted', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Extraction.saveSchema({ ledger, key: 'bank.yml', content: schema });
			await Extraction.deleteSchema(ledger, 'bank.yml');

			expect(await Extraction.listSchemas(ledger)).toEqual(ok([]));
		}));
});
