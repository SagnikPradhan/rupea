import { statementContents } from '#services/extraction/adapters/database-schema.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { broken } from '#tests/shared/embedding.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { createHash } from 'node:crypto';
import { it } from '#tests/shared/vitest.ts';
import { inArray } from 'drizzle-orm';
import officeCrypto from 'officecrypto-tool';
import * as XLSX from 'xlsx';
import { describe, expect } from 'vitest';
import * as Drafts from '#services/extraction/application/drafts.ts';
import * as Statements from '#services/extraction/application/statements.ts';
import * as Files from '#services/ledger/application/files.ts';
import { bank, day, encode, folder, statement, upload } from './fixtures/bank';

const sha256 = (c: Uint8Array) => `sha256:${createHash('sha256').update(c).digest('hex')}`;

const lockedSheet = async () => {
	const book = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Date', 'Narration']]));
	const plain = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
	return new Uint8Array(await officeCrypto.encrypt(plain, { password: 'secret' }));
};

describe('uploading a statement', () => {
	it("keeps it in a folder for the day, among its ledger's files for review", ({
		context,
		db,
		storage,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const uploaded = await upload(ledger);
			const stored = await storage.read(`${folder(ledger)}/files/_/statements/${day()}/aug.csv`);

			expect(uploaded).toMatchObject({
				key: `${day()}/aug.csv`,
				checksum: expect.stringMatching(/^sha256:/),
			});
			expect(uploaded.grid[1]).toEqual(['Date', 'Narration', 'Debit', 'Credit', 'Tag']);
			expect(stored.isOk()).toBe(true);
		}));

	it('keeps one copy of the same statement, and numbers another of the same name', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const first = await upload(ledger);
			const again = await upload(ledger);
			const other = await upload(ledger, `${statement}\n`);

			expect(again).toEqual(first);
			expect(other.key).toBe(`${day()}/aug-02.csv`);
			expect(other.checksum).not.toBe(first.checksum);
		}));

	it('finds content the ledger already has, under any name', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const first = await upload(ledger);
			const renamed = await upload(ledger, statement, 'renamed.csv');

			expect(renamed).toEqual(first);
		}));

	it('stores a statement again once its file was moved or deleted', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const first = await upload(ledger);
			await Files.renameFiles(ledger, [{ from: `_/statements/${first.key}`, to: 'aug.csv' }]);
			const moved = await upload(ledger);
			await Files.deleteFiles(ledger, [`_/statements/${moved.key}`]);
			const deleted = await upload(ledger);

			expect(moved).toMatchObject({ key: first.key, checksum: first.checksum });
			expect(deleted).toMatchObject({ key: first.key, checksum: first.checksum });
		}));

	it('keeps a locked statement, and replaces it with its content unlocked', ({
		context,
		db,
		storage,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = await lockedSheet();
			const key = `${day()}/aug.xlsx`;
			await Statements.storeStatement(ledger, { name: 'aug.xlsx', content });
			const locked = await Statements.findStatement(ledger, key);
			expect(locked).toMatchObject({ error: { type: 'ExtractionLocked', path: key } });

			const unlocked = await Statements.unlockStatement({
				ledger,
				statement: key,
				password: 'secret',
			});
			const stored = await storage.read(`${folder(ledger)}/files/_/statements/${key}`);

			expect(unlocked._unsafeUnwrap()).toMatchObject({ key, originalChecksum: sha256(content) });
			expect(unlocked._unsafeUnwrap().grid[0]).toEqual(['Date', 'Narration']);
			expect([...stored._unsafeUnwrap().content.subarray(0, 2)]).toEqual([0x50, 0x4b]);
		}));

	it('finds a statement it unlocked when the locked one comes again', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const content = await lockedSheet();
			const key = `${day()}/aug.xlsx`;
			await Statements.storeStatement(ledger, { name: 'aug.xlsx', content });
			await Statements.unlockStatement({ ledger, statement: key, password: 'secret' });
			const again = await Statements.storeStatement(ledger, { name: 'sep.xlsx', content });

			expect(again._unsafeUnwrap()).toMatchObject({ key, originalChecksum: sha256(content) });
		}));

	it('reads a statement the table does not know yet, and records it', ({ context, db, storage }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const content = encode(statement);
			await storage.write({ key: `${folder(ledger)}/files/_/statements/aug.csv`, content });
			const draft = await Drafts.extract({ ledger, statement: 'aug.csv', schema: bank });

			expect(draft._unsafeUnwrap().content).toContain(`- checksum: ${sha256(content)}`);
		}));

	it('keeps nothing it cannot read', ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const unread = await Statements.storeStatement(ledger, {
				name: 'aug.doc',
				content: encode(statement),
			});
			const stored = await storage.read(`${folder(ledger)}/files/_/statements/${day()}/aug.doc`);

			expect(unread).toMatchObject({ error: { type: 'ExtractionUnsupportedFile' } });
			expect(stored.isErr()).toBe(true);
		}));
});

describe('caching what a statement reads', () => {
	it('reads the stored statement again once its grid expired', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const { key } = await upload(ledger);
			await db.update(statementContents).set({ expiresAt: new Date(0) });

			const draft = await Drafts.extract({
				ledger,
				statement: key,
				schema: bank,
			});

			expect(draft._unsafeUnwrap().content).toContain('UPI GROCER');
			const [cached] = await db.select().from(statementContents);
			expect(cached?.expiresAt.getTime()).toBeGreaterThan(Date.now());
		}));

	it('sweeps expired grids when it caches another', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const aug = await upload(ledger);
			await db.update(statementContents).set({ expiresAt: new Date(0) });
			const sep = await upload(ledger, `${statement}\nsep`, 'sep.csv');

			const cached = await db
				.select({ checksum: statementContents.checksum })
				.from(statementContents)
				.where(inArray(statementContents.checksum, [aug.checksum, sep.checksum]));
			expect(cached).toEqual([{ checksum: sep.checksum }]);
		}));
});
