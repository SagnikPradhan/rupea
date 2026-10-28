import { count } from '#tests/shared/count.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect } from 'vitest';
import { attemptWrite } from '#lib/server/db/errors.ts';
import type { Database } from '#lib/server/db/index.ts';
import { AccountType } from '#services/ledger/domain/types.ts';

const findLedger = (db: Database, id: string) =>
	db.selectFrom('ledgers').selectAll().where('id', '=', id).executeTakeFirst();

const createFile = (db: Database, ledgerId: string) =>
	db
		.insertInto('ledgerFiles')
		.values({ ledgerId, key: 'a', version: '1' })
		.returning('id')
		.executeTakeFirstOrThrow();

const createTransaction = (db: Database, ledgerId: string, fileId: string) =>
	db
		.insertInto('transactions')
		.values({ ledgerId, fileId, line: 1, date: '2026-01-01', description: 'x' })
		.returning('id')
		.executeTakeFirstOrThrow();

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('the database', () => {
	it('stamps updatedAt on every update, and leaves createdAt alone', async ({ db }) => {
		const id = (await createLedger(db)).id;
		const before = await findLedger(db, id);
		await pause(5);
		await db.updateTable('ledgers').set({ name: 'Renamed' }).where('id', '=', id).execute();
		const after = await findLedger(db, id);

		expect(after?.name).toBe('Renamed');
		expect(after?.createdAt).toEqual(before?.createdAt);
		expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
	});

	it('stamps updatedAt on every table that has one', async ({ db }) => {
		const unstamped = await sql<{ tableName: string }>`
			select c.table_name from information_schema.columns c
			where c.table_schema = 'public' and c.column_name = 'updated_at'
				and not exists (
					select from information_schema.triggers t
					where t.event_object_table = c.table_name and t.trigger_name = 'set_updated_at'
				)
		`.execute(db);

		expect(unstamped.rows).toEqual([]);
	});

	it('gives every row a UUIDv7 id and equal create and update times', async ({ db }) => {
		const id = (await createLedger(db)).id;
		const row = await findLedger(db, id);

		expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
		expect(row?.updatedAt).toEqual(row?.createdAt);
	});

	it('keeps amounts exact beyond 2^53, in rows and in sums', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		const file = await createFile(db, ledgerId);
		const tx = await createTransaction(db, ledgerId, file.id);
		const big = 9_007_199_254_740_993n;
		const [a, b] = await db
			.insertInto('accounts')
			.values(
				['Assets:A', 'Assets:B'].map((name) => ({ ledgerId, name, type: AccountType.Assets })),
			)
			.returning('id')
			.execute();
		const posting = {
			ledgerId,
			transactionId: tx.id,
			date: '2026-01-01',
			accountType: AccountType.Assets,
			commodity: 'INR',
		};
		await db
			.insertInto('postings')
			.values([
				{ ...posting, position: 0, accountId: a?.id ?? '', amount: big },
				{ ...posting, position: 1, accountId: b?.id ?? '', amount: -big },
			])
			.execute();

		const rows = await db
			.selectFrom('postings')
			.select('amount')
			.where('transactionId', '=', tx.id)
			.orderBy('position')
			.execute();
		expect(rows.map((r) => r.amount)).toEqual([big, -big]);
	});

	it('stamps updatedAt on an upsert too', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		const upsert = (version: string) =>
			db
				.insertInto('ledgerFiles')
				.values({ ledgerId, key: 'a', version })
				.onConflict((o) => o.columns(['ledgerId', 'key']).doUpdateSet({ version }))
				.returningAll()
				.executeTakeFirstOrThrow();
		const before = await upsert('1');
		await pause(5);
		const after = await upsert('2');

		expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
	});

	it('writes a transaction all together or not at all', async ({ db }) => {
		const id = (await createLedger(db)).id;
		const failing = db.transaction().execute(async (tx) => {
			await tx.updateTable('ledgers').set({ name: 'Half done' }).where('id', '=', id).execute();
			await tx
				.insertInto('ledgerFiles')
				.values({ ledgerId: uuidv7(), key: 'a', version: '1' })
				.execute();
		});

		await expect(failing).rejects.toMatchObject({ message: /foreign key/ });
		const row = await findLedger(db, id);
		expect(row?.name).toBe('Test');
	});

	it('gives every metadata row exactly one owner', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		const file = await createFile(db, ledgerId);
		const tx = await createTransaction(db, ledgerId, file.id);
		const entry = { ledgerId, position: 0, key: 'k', value: 'v' };
		const insert = (fileId: string | null, transactionId: string | null) =>
			db
				.insertInto('metadata')
				.values({ ...entry, fileId, transactionId })
				.execute();

		const check = { message: /metadata_one_owner/ };

		await expect(insert(null, null)).rejects.toMatchObject(check);
		await expect(insert(file.id, tx.id)).rejects.toMatchObject(check);
		await insert(null, tx.id);
		expect(await count(db.selectFrom('metadata').where('transactionId', '=', tx.id))).toBe(1);
	});

	it('removes what hangs off a row it deletes', async ({ db }) => {
		const ledgerId = (await createLedger(db)).id;
		await createFile(db, ledgerId);
		await db.deleteFrom('ledgers').where('id', '=', ledgerId).execute();

		expect(await count(db.selectFrom('ledgerFiles').where('ledgerId', '=', ledgerId))).toBe(0);
	});

	it("takes a user's storage and ledgers with them", async ({ db }) => {
		const ledger = await createLedger(db);
		await createFile(db, ledger.id);
		await db.deleteFrom('users').where('id', '=', ledger.owner).execute();

		expect(await count(db.selectFrom('storages').where('userId', '=', ledger.owner))).toBe(0);
		expect(await count(db.selectFrom('ledgers').where('id', '=', ledger.id))).toBe(0);
		expect(await count(db.selectFrom('ledgerFiles').where('ledgerId', '=', ledger.id))).toBe(0);
	});

	it('reads what was just written, however many queries are in flight', async ({ db }) => {
		const ids = (await Promise.all(Array.from({ length: 20 }, () => createLedger(db)))).map(
			(l) => l.id,
		);
		const found = await Promise.all(ids.map((id) => findLedger(db, id)));

		expect(found.map((f) => f?.id)).toEqual(ids);
	});

	it('names the unique constraint a write breaks, and nothing else', async ({ db }) => {
		const ledger = await createLedger(db);
		const insert = (ownerId: string, handle: string) =>
			attemptWrite(() =>
				db.insertInto('ledgers').values({ id: uuidv7(), ownerId, handle, name: 'x' }).execute(),
			);

		expect((await insert(ledger.owner, ledger.handle))._unsafeUnwrapErr()).toEqual({
			type: 'UniqueViolation',
			constraint: 'ledgers_handle_unique',
		});
		expect((await insert(uuidv7(), uuidv7()))._unsafeUnwrapErr()).toMatchObject({
			type: 'UnknownError',
		});
	});
});
