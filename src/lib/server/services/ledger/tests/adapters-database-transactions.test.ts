import type { Database } from '#lib/server/db/index.ts';
import { EMBEDDING_DIMENSIONS } from '#lib/server/shared/onnx/models.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import * as DB from '#services/ledger/adapters/database.ts';

// The column holds full-width vectors; the rest of these stay zero.
const vector = (...l: number[]) => {
	const v = new Float32Array(EMBEDDING_DIMENSIONS);
	v.set(l);
	return v;
};

const spend = (date: string, description: string, account: string) =>
	`${date} ${description}\n\tAssets:Bank -100\n\t${account}\n`;

const ledgerWith = async (db: Database, ...transactions: string[]) => {
	const ledger = await createLedger(db);
	await Files.createFile({ ledger, key: 'a.rupee', content: transactions.join('\n') });
	return ledger.id;
};

// Gives every unembedded transaction the vector its description maps to.
const embedAll = async (
	ledgerId: string,
	model: string,
	of: (d: string) => Float32Array | null,
) => {
	const rows = (await DB.listUnembedded(ledgerId, model, 1000))._unsafeUnwrap();
	await DB.saveEmbeddings(
		ledgerId,
		model,
		rows.map((r) => ({ id: r.id, vector: of(r.description) })),
	);
};

describe('the embeddings of a ledger', () => {
	it('lists what is not embedded yet, latest first', ({ context, db }) =>
		provide(context, async () => {
			const ledgerId = await ledgerWith(
				db,
				spend('2026-01-01', 'OLD', 'Expenses:Food'),
				spend('2026-03-01', 'NEW', 'Expenses:Food'),
				spend('2026-02-01', 'MID', 'Expenses:Food'),
			);
			const rows = (await DB.listUnembedded(ledgerId, 'm1', 2))._unsafeUnwrap();
			expect(rows.map((r) => r.description)).toEqual(['NEW', 'MID']);
		}));

	it('counts a transaction done once filled, even with no vector, until the model changes', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledgerId = await ledgerWith(
				db,
				spend('2026-01-01', 'SWIGGY', 'Expenses:Food'),
				spend('2026-01-02', '123456', 'Expenses:Food'),
			);
			await embedAll(ledgerId, 'm1', (d) => (d === 'SWIGGY' ? vector(1) : null));

			expect((await DB.listUnembedded(ledgerId, 'm1', 10))._unsafeUnwrap()).toEqual([]);
			expect((await DB.listUnembedded(ledgerId, 'm2', 10))._unsafeUnwrap()).toHaveLength(2);
		}));

	it('finds the postings of the nearest transactions, for each vector in order', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledgerId = await ledgerWith(
				db,
				spend('2026-01-01', 'SWIGGY', 'Expenses:Food'),
				spend('2026-01-02', 'UBER', 'Expenses:Commute'),
			);
			await embedAll(ledgerId, 'm1', (d) => (d === 'SWIGGY' ? vector(1) : vector(0, 1)));

			const nearest = await DB.findNearest(ledgerId, 'm1', [vector(1), vector(0, 1)]);
			const [food, commute] = nearest._unsafeUnwrap();
			const best = (n: typeof food) =>
				n
					?.filter((p) => p.similarity > 0.99)
					.map((p) => p.account)
					.toSorted();
			expect(best(food)).toEqual(['Assets:Bank', 'Expenses:Food']);
			expect(best(commute)).toEqual(['Assets:Bank', 'Expenses:Commute']);
			expect(food?.[0]).toMatchObject({ amount: expect.any(BigInt), date: expect.anything() });
		}));

	it('finds only its own ledger, however many near rows other ledgers have', ({ context, db }) =>
		provide(context, async () => {
			const crowd = Array.from({ length: 300 }, (_, i) =>
				spend('2026-01-01', `OTHER ${i}`, 'Expenses:Theirs'),
			);
			await ledgerWith(db, ...crowd).then((l) => embedAll(l, 'm1', () => vector(1)));
			const ledgerId = await ledgerWith(db, spend('2026-01-01', 'MINE', 'Expenses:Mine'));
			await embedAll(ledgerId, 'm1', () => vector(1, 0.1));

			const [found] = (await DB.findNearest(ledgerId, 'm1', [vector(1)]))._unsafeUnwrap();
			expect(found?.map((p) => p.account).toSorted()).toEqual(['Assets:Bank', 'Expenses:Mine']);
		}));

	it('finds nothing embedded by another model', ({ context, db }) =>
		provide(context, async () => {
			const ledgerId = await ledgerWith(db, spend('2026-01-01', 'SWIGGY', 'Expenses:Food'));
			await embedAll(ledgerId, 'm1', () => vector(1));

			expect((await DB.findNearest(ledgerId, 'm2', [vector(1)]))._unsafeUnwrap()).toEqual([[]]);
		}));

	it('knows the accounts posted to', ({ context, db }) =>
		provide(context, async () => {
			const ledgerId = await ledgerWith(
				db,
				spend('2026-01-01', 'A', 'Expenses:Food'),
				spend('2026-01-02', 'B', 'Expenses:Food'),
			);

			const accounts = (await DB.listAccountNames(ledgerId))._unsafeUnwrap();
			expect(accounts.toSorted()).toEqual(['Assets:Bank', 'Expenses:Food']);
		}));
});
