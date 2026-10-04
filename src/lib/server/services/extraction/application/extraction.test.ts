import { describe, expect } from 'vitest';
import type { Database } from '#lib/server/db/index.ts';
import * as Ledger from '#lib/server/services/ledger/application/ledger.ts';
import { provide } from '#lib/server/shared/context.ts';
import { it } from '#tests/shared/vitest.ts';
import * as Extraction from './extraction';
import { err, ok } from '#lib/server/shared/result.ts';

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

/** A user with a ledger of their own. */
const createUser = async (db: Database) => {
	const { id: ledgerId } = await db.orm.Ledger.create({ name: 'Test' });
	const user = await db.orm.User.create({
		email: `${ledgerId}@example.com`,
		ledgerId,
	});
	return user.id;
};

const upload = (name: string, text: string) => ({
	name,
	content: new TextEncoder().encode(text),
});

describe('extracting a statement', () => {
	it('reads a statement into a draft that parses', ({ context, db }) =>
		provide(context, async () => {
			const userId = await createUser(db);
			await Extraction.saveSchema({ userId, key: 'bank.yml', content: schema });
			const draft = await Extraction.extract(userId, {
				schema: 'bank.yml',
				file: upload('aug.csv', statement),
				account: 'Assets:Bank',
			});

			expect(draft).toEqual(
				ok({
					key: 'imports/aug.rupee',
					content: [
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
			expect(Ledger.check('aug.rupee', draft.value.content).failed).toEqual([]);
		}));

	it('fails without the schema', ({ context, db }) =>
		provide(context, async () => {
			const userId = await createUser(db);
			expect(
				await Extraction.extract(userId, {
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
			const userId = await createUser(db);
			await Extraction.saveSchema({ userId, key: 'bank.yml', content: schema });
			expect(await Extraction.listSchemas(userId)).toMatchObject(ok([{ key: 'bank.yml' }]));
			expect(await Extraction.readSchema(userId, 'bank.yml')).toMatchObject(
				ok({ content: schema }),
			);
		}));

	it('are refused when they do not parse', ({ context, db }) =>
		provide(context, async () => {
			const userId = await createUser(db);
			expect(
				await Extraction.saveSchema({
					userId,
					key: 'bad.yml',
					content: 'version: v2',
				}),
			).toMatchObject(err({ type: 'ExtractionInvalidSchema', path: 'bad.yml' }));
			expect(await Extraction.listSchemas(userId)).toEqual(ok([]));
		}));
});
