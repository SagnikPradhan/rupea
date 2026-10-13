import { statementGrids } from '#lib/server/db/schema.ts';
import { provide } from '#lib/server/shared/context.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { broken, hashed } from '#tests/shared/embedding.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import * as Extraction from '#services/extraction/application/extraction.ts';

const schema = `version: v1
name: Bank
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

const encode = (text: string) => new TextEncoder().encode(text);

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
				account: 'Assets:Bank',
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
				account: 'Assets:Bank',
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
				account: 'Assets:Bank',
			});

			expect(draft._unsafeUnwrap().content).toContain(
				['2026-08-29 UPI GROCER', '\tAssets:Bank = 8749.50', '\tExpenses:Food 1250.50'].join('\n'),
			);
			expect(draft._unsafeUnwrap().content).toContain('\tAssets:Bank 50000.00\n');
		}));

	it('names the schema when it does not parse', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await Extraction.extract({
					ledger,
					statement: (await read(ledger)).key,
					schema: { key: 'bank.yml', content: 'version: v2' },
					account: 'Assets:Bank',
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
				account: 'Assets:Bank',
			});

			expect(draft._unsafeUnwrap().content).toContain('UPI GROCER');
			const [cached] = await db.select().from(statementGrids);
			expect(cached?.expiresAt.getTime()).toBeGreaterThan(Date.now());
		}));

	it('sweeps expired grids when it caches another', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await read(ledger);
			await db.update(statementGrids).set({ expiresAt: new Date(0) });
			await read(ledger, statement, 'sep.csv');

			const cached = await db
				.select({ statement: statementGrids.statement })
				.from(statementGrids)
				.where(eq(statementGrids.ledgerId, ledger.id));
			expect(cached).toEqual([{ statement: 'sep.csv' }]);
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
