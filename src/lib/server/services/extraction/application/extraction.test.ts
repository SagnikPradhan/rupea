import { provide } from '#lib/server/shared/context.ts';
import { err, ok } from '#lib/server/shared/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { broken, hashed } from '#tests/shared/embedding.ts';
import { createLedger, createUser } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import * as Extraction from './extraction';

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

const upload = (name: string, text: string) => ({
	name,
	content: new TextEncoder().encode(text),
});

describe('extracting a statement', () => {
	it('reads a statement into a draft that parses', ({ context, db }) =>
		// Without the model, lines nobody categorised stay uncategorised.
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			await Extraction.saveSchema({ user: ledger.owner, key: 'bank.yml', content: schema });
			const draft = await Extraction.extract({
				user: ledger.owner,
				ledger,
				schema: 'bank.yml',
				file: upload('aug.csv', statement),
				account: 'Assets:Bank',
			});

			expect(draft).toEqual(
				ok({
					key: 'imports/aug.rupee',
					content: [
						'- statement: aug.csv',
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
							cause: [],
						},
					],
				}),
			);
			if (draft.isErr()) return;
			expect(Ledger.check('aug.rupee', draft.value.content)).toMatchObject({
				metadata: { statement: ['aug.csv'] },
				failed: [],
			});
		}));

	it('files uncategorised lines under the accounts the ledger shows', ({ context, db }) =>
		provide({ ...context, models: hashed(context.models) }, async () => {
			const ledger = await createLedger(db);
			await Extraction.saveSchema({ user: ledger.owner, key: 'bank.yml', content: schema });
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
				schema: 'bank.yml',
				file: upload('aug.csv', statement),
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
			await Extraction.saveSchema({
				user: ledger.owner,
				key: 'bank.yml',
				content: `${schema}  balance: { from: [header: Balance], pipe: [number] }\n`,
			});
			const draft = await Extraction.extract({
				user: ledger.owner,
				ledger,
				schema: 'bank.yml',
				file: upload(
					'aug.csv',
					[
						'Date,Narration,Debit,Credit,Tag,Balance',
						'29/08/26,UPI GROCER,"1,250.50",,Expenses:Food,"8,749.50"',
						'30/08/26,SALARY,,"50,000",,',
					].join('\n'),
				),
				account: 'Assets:Bank',
			});

			expect(draft._unsafeUnwrap().content).toContain(
				['2026-08-29 UPI GROCER', '\tAssets:Bank = 8749.50', '\tExpenses:Food 1250.50'].join('\n'),
			);
			expect(draft._unsafeUnwrap().content).toContain('\tAssets:Bank 50000.00\n');
		}));

	it('fails without the schema', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await Extraction.extract({
					user: ledger.owner,
					ledger,
					schema: 'missing.yml',
					file: upload('aug.csv', statement),
					account: 'Assets:Bank',
				}),
			).toMatchObject(err({ type: 'CannotReadFile', path: 'missing.yml' }));
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
			).toMatchObject(err({ type: 'ExtractionInvalidSchema', path: 'bad.yml' }));
			expect(await Extraction.listSchemas(userId)).toEqual(ok([]));
		}));

	it("live in their user's storage, not in a ledger", ({ context, db, storage }) =>
		provide(context, async () => {
			const { userId } = await createUser(db);
			await Extraction.saveSchema({ user: userId, key: 'bank.yml', content: schema });

			expect((await storage.read(`users/${userId}/schemas/bank.yml`)).isOk()).toBe(true);
		}));

	it("serve their user's imports into someone else's ledger", ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const member = await createUser(db);
			await Extraction.saveSchema({ user: member.userId, key: 'bank.yml', content: schema });
			const extract = (user: string) =>
				Extraction.extract({
					user,
					ledger,
					schema: 'bank.yml',
					file: upload('aug.csv', statement),
					account: 'Assets:Bank',
				});

			expect((await extract(member.userId)).isOk()).toBe(true);
			expect(await extract(ledger.owner)).toMatchObject(
				err({ type: 'CannotReadFile', path: 'bank.yml' }),
			);
		}));
});
