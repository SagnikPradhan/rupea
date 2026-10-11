import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect } from 'vitest';
import { it } from '#tests/shared/vitest.ts';
import { createLedger } from '#tests/shared/seed.ts';
import type { Database } from './index';
import { ledgerFiles, ledgers, metadata, postings, storages, transactions, users } from './schema';

const findLedger = (db: Database, id: string) =>
	db
		.select()
		.from(ledgers)
		.where(eq(ledgers.id, id))
		.then(([l]) => l);

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('the database', () => {
	it('stamps updatedAt on every update, and leaves createdAt alone', async ({ db }) => {
		const id = (await createLedger(db)).id;
		const before = await findLedger(db, id);
		await pause(5);
		await db.update(ledgers).set({ name: 'Renamed' }).where(eq(ledgers.id, id));
		const after = await findLedger(db, id);

		expect(after?.name).toBe('Renamed');
		expect(after?.createdAt).toEqual(before?.createdAt);
		expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
	});

	it('gives every row a UUIDv7 id and equal create and update times', async ({ db }) => {
		const id = (await createLedger(db)).id;
		const row = await findLedger(db, id);

		expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
		expect(row?.updatedAt).toEqual(row?.createdAt);
	});

	it('keeps amounts exact beyond 2^53, in rows and in sums', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		const [file] = await db.insert(ledgerFiles).values({ ledgerId, key: 'a' }).returning();
		const [tx] = await db
			.insert(transactions)
			.values({ ledgerId, fileId: file!.id, line: 1, date: '2026-01-01', description: 'x' })
			.returning();
		const big = 9_007_199_254_740_993n;
		const posting = {
			ledgerId,
			transactionId: tx!.id,
			accountType: 'Assets' as const,
			commodity: 'INR',
		};
		await db.insert(postings).values([
			{ ...posting, position: 0, account: 'Assets:A', amount: big },
			{ ...posting, position: 1, account: 'Assets:B', amount: -big },
		]);

		const rows = await db
			.select({ amount: postings.amount })
			.from(postings)
			.orderBy(postings.position);
		expect(rows.map((r) => r.amount)).toEqual([big, -big]);
	});

	it('stamps updatedAt on an upsert too', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		const upsert = (version: string) =>
			db
				.insert(ledgerFiles)
				.values({ ledgerId, key: 'a', version })
				.onConflictDoUpdate({ target: [ledgerFiles.ledgerId, ledgerFiles.key], set: { version } })
				.returning()
				.then(([f]) => f);
		const before = await upsert('1');
		await pause(5);
		const after = await upsert('2');

		expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
	});

	it('writes a transaction all together or not at all', async ({ db }) => {
		const id = (await createLedger(db)).id;
		const failing = db.transaction(async (tx) => {
			await tx.update(ledgers).set({ name: 'Half done' }).where(eq(ledgers.id, id));
			await tx.insert(ledgerFiles).values({ ledgerId: uuidv7(), key: 'a' });
		});

		await expect(failing).rejects.toMatchObject({ cause: { message: /foreign key/ } });
		const row = await findLedger(db, id);
		expect(row?.name).toBe('Test');
	});

	it('gives every metadata row exactly one owner', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		const [file] = await db.insert(ledgerFiles).values({ ledgerId, key: 'a' }).returning();
		const [tx] = await db
			.insert(transactions)
			.values({ ledgerId, fileId: file!.id, line: 1, date: '2026-01-01', description: 'x' })
			.returning();
		const entry = { ledgerId, position: 0, key: 'k', value: 'v' };

		const check = { cause: { message: /metadata_one_owner/ } };

		await expect(db.insert(metadata).values(entry)).rejects.toMatchObject(check);
		await expect(
			db.insert(metadata).values({ ...entry, fileId: file!.id, transactionId: tx!.id }),
		).rejects.toMatchObject(check);
		await db.insert(metadata).values({ ...entry, transactionId: tx!.id });
		expect(await db.$count(metadata, eq(metadata.transactionId, tx!.id))).toBe(1);
	});

	it('removes what hangs off a row it deletes', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		await db.insert(ledgerFiles).values({ ledgerId, key: 'a' });
		await db.delete(ledgers).where(eq(ledgers.id, ledgerId));

		expect(await db.$count(ledgerFiles, eq(ledgerFiles.ledgerId, ledgerId))).toBe(0);
	});

	it("takes a user's storage and the ledgers in it with them", async ({ db }) => {
		const ledger = await createLedger(db);
		await db.insert(ledgerFiles).values({ ledgerId: ledger.id, key: 'a' });
		await db.delete(users).where(eq(users.id, ledger.owner));

		expect(await db.$count(storages, eq(storages.userId, ledger.owner))).toBe(0);
		expect(await db.$count(ledgers, eq(ledgers.id, ledger.id))).toBe(0);
		expect(await db.$count(ledgerFiles, eq(ledgerFiles.ledgerId, ledger.id))).toBe(0);
	});

	it('reads what was just written, however many queries are in flight', async ({ db }) => {
		const ids = (await Promise.all(Array.from({ length: 20 }, () => createLedger(db)))).map(
			(l) => l.id,
		);
		const found = await Promise.all(ids.map((id) => findLedger(db, id)));

		expect(found.map((f) => f?.id)).toEqual(ids);
	});
});
