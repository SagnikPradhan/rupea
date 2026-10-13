import { statementGrids } from '#lib/server/db/schema.ts';
import { provide } from '#lib/server/shared/context.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { broken, hashed } from '#tests/shared/embedding.ts';
import { createLedger, createUser } from '#tests/shared/seed.ts';
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

const read = async (user: string, text = statement, name = 'aug.csv') =>
	(await Extraction.readStatement(user, { name, content: encode(text) }))._unsafeUnwrap();

const bank = { key: 'bank.yml', content: schema };

describe('reading a statement', () => {
	it("keeps it in its user's statements", ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const read1 = await read(userId);

			expect(read1).toMatchObject({ key: 'aug.csv', checksum: expect.stringMatching(/^sha256:/) });
			expect(read1.grid[1]).toEqual(['Date', 'Narration', 'Debit', 'Credit', 'Tag']);
			expect((await storage.read(`users/${userId}/statements/aug.csv`)).isOk()).toBe(true);
		}));

	it('keeps one copy of the same statement, and numbers another of the same name', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const first = await read(userId);
			const again = await read(userId);
			const other = await read(userId, `${statement}\n`);

			expect(again).toEqual(first);
			expect(other.key).toBe('aug (2).csv');
			expect(other.checksum).not.toBe(first.checksum);
		}));

	it('keeps nothing it cannot read', ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			const unread = await Extraction.readStatement(userId, {
				name: 'aug.txt',
				content: encode(statement),
			});

			expect(unread).toMatchObject({ error: { type: 'ExtractionUnsupportedFile' } });
			expect((await storage.read(`users/${userId}/statements/aug.txt`)).isErr()).toBe(true);
		}));
});

describe('extracting a statement', () => {
	it('drafts a ledger file that parses, citing the statement', ({ context, db }) =>
		// Without the model, lines nobody categorised stay uncategorised.
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const { key, checksum } = await read(ledger.owner);
			const draft = await Extraction.extract({
				user: ledger.owner,
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
				user: ledger.owner,
				ledger,
				statement: (await read(ledger.owner)).key,
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
				user: ledger.owner,
				ledger,
				statement: (await read(ledger.owner, balances)).key,
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
					user: ledger.owner,
					ledger,
					statement: (await read(ledger.owner)).key,
					schema: { key: 'bank.yml', content: 'version: v2' },
					account: 'Assets:Bank',
				}),
			).toMatchObject({ error: { type: 'ExtractionInvalidSchema', path: 'bank.yml' } });
		}));

	it('reads the stored statement again once its grid expired', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const { key } = await read(ledger.owner);
			await db.update(statementGrids).set({ expiresAt: new Date(0) });

			const draft = await Extraction.extract({
				user: ledger.owner,
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
			const { userId } = await createUser(db);
			await read(userId);
			await db.update(statementGrids).set({ expiresAt: new Date(0) });
			await read(userId, statement, 'sep.csv');

			const cached = await db
				.select({ statement: statementGrids.statement })
				.from(statementGrids)
				.where(eq(statementGrids.userId, userId));
			expect(cached).toEqual([{ statement: 'sep.csv' }]);
		}));
});

describe('statement schemas', () => {
	it('are saved, listed and read back', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Extraction.saveSchema({ user: userId, key: 'bank.yml', content: schema });
			expect(await Extraction.listSchemas(userId)).toMatchObject(ok([{ key: 'bank.yml' }]));
			expect(await Extraction.readSchema(userId, 'bank.yml')).toMatchObject(
				ok({ content: schema }),
			);
		}));

	it('are refused when they do not parse', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			expect(
				await Extraction.saveSchema({
					user: userId,
					key: 'bad.yml',
					content: 'version: v2',
				}),
			).toMatchObject({ error: { type: 'ExtractionInvalidSchema', path: 'bad.yml' } });
			expect(await Extraction.listSchemas(userId)).toEqual(ok([]));
		}));

	it("live in their user's storage, not in a ledger", ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Extraction.saveSchema({ user: userId, key: 'bank.yml', content: schema });

			expect((await storage.read(`users/${userId}/schemas/bank.yml`)).isOk()).toBe(true);
		}));

	it('are deleted', ({ context, db }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Extraction.saveSchema({ user: userId, key: 'bank.yml', content: schema });
			await Extraction.deleteSchema(userId, 'bank.yml');

			expect(await Extraction.listSchemas(userId)).toEqual(ok([]));
		}));
});
