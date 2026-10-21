import { provide } from '#lib/server/shared/context/context.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Drafts from '#services/extraction/application/drafts.ts';
import { importStatement } from '#services/extraction/adapters/jobs.ts';
import * as Uploads from '#services/extraction/application/uploads.ts';
import { jobs } from '#services/jobs/adapters/database-schema.ts';
import { listJobs } from '#services/jobs/application/jobs.ts';
import { JobStatus } from '#services/jobs/domain/jobs.ts';
import { metadata } from '#services/ledger/adapters/database-schema.ts';
import { runJob } from '#services/jobs/application/worker.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Transactions from '#services/ledger/application/transactions.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { broken } from '#tests/shared/embedding.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { bank, day, encode, statement } from './fixtures/bank';

const books = '2026-08-29 Tea\n\tExpenses:Food 10\n\tAssets:Cash\n';

const uploads = (l: Ledger, files: Record<string, string>) =>
	Uploads.uploadStatements({
		ledger: l,
		user: l.owner,
		uploads: Object.entries(files).map(([name, t]) => ({ name, content: encode(t) })),
	});

/** Runs each queued import as a worker would, oldest first. */
const runImports = async (l: Ledger) => {
	const queued = (
		await listJobs({ userId: l.owner, name: importStatement.name, payload: {}, limit: 50 })
	)._unsafeUnwrap();
	for (const job of queued.toReversed().filter((j) => j.status === 'queued'))
		await runJob([importStatement], {
			id: job.id,
			userId: l.owner,
			name: importStatement.name,
			version: importStatement.version,
			payload: job.payload,
			attempts: 1,
		});
};

describe('uploading statements', () => {
	it('stores each upload and queues an import for each ledger file', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const uploaded = await uploads(ledger, { 'books.ledger': books, 'aug.csv': statement });
			const queued = await Uploads.listImports(ledger, ledger.owner);

			expect(uploaded).toEqual(
				ok({
					succeeded: [
						{ key: `${day()}/books.ledger`, queued: true },
						{ key: `${day()}/aug.csv`, queued: false },
					],
					failed: [],
				}),
			);
			expect(queued).toMatchObject(ok([{ status: 'queued', statement: `${day()}/books.ledger` }]));
		}));

	it('stores the rest when one cannot be read', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const uploaded = await uploads(ledger, { 'a.doc': 'x', 'books.ledger': books });

			expect(uploaded).toMatchObject(
				ok({
					succeeded: [{ key: `${day()}/books.ledger`, queued: true }],
					failed: [{ type: 'ExtractionUnsupportedFile' }],
				}),
			);
		}));
});

describe('importing a ledger file', () => {
	it('files it for review as written, citing its statement, and counts none of it', ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await uploads(ledger, { 'books.ledger': books });
			await runImports(ledger);
			const file = await Files.getFile(ledger, `_/imports/${day()}/books.rupee`);

			expect(file._unsafeUnwrap().content).toMatch(
				new RegExp(`^- statement: ${day()}/books.ledger\n- checksum: sha256:\\w+\n${books}$`),
			);
			expect(await Transactions.getTransactions(ledger)).toMatchObject(ok({ succeeded: [] }));
		}));

	it('imports a statement once, however often it comes', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await uploads(ledger, { 'books.ledger': books });
			await runImports(ledger);
			await uploads(ledger, { 'again.ledger': books });
			await runImports(ledger);

			const listed = (await Files.listFiles(ledger))._unsafeUnwrap().succeeded;
			expect(listed.map((f) => f.key)).toEqual([`_/imports/${day()}/books.rupee`]);
		}));

	it('runs again without a second copy', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await uploads(ledger, { 'books.ledger': books });
			await runImports(ledger);
			await db.delete(metadata);
			await db.update(jobs).set({ status: JobStatus.Queued });
			await runImports(ledger);

			const listed = (await Files.listFiles(ledger))._unsafeUnwrap().succeeded;
			expect(listed.map((f) => f.key)).toEqual([`_/imports/${day()}/books.rupee`]);
		}));

	it('leaves only statements to read that no file cites in the inbox', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			await uploads(ledger, { 'books.ledger': books, 'aug.csv': statement });
			const before = await Uploads.listInbox(ledger);
			await Drafts.save({ ledger, statement: `${day()}/aug.csv`, schema: bank });
			const after = await Uploads.listInbox(ledger);

			expect(before._unsafeUnwrap().map((s) => s.key)).toEqual([`${day()}/aug.csv`]);
			expect(after).toEqual(ok([]));
		}));
});

describe('the inbox and the imports', () => {
	it('leave out a statement deleted since, and a job that no longer reads', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await uploads(ledger, { 'books.ledger': books, 'aug.csv': statement });
			await Files.deleteFiles(ledger, [`_/statements/${day()}/aug.csv`]);
			await db.update(jobs).set({ payload: { ledger: ledger.handle } });

			expect(await Uploads.listInbox(ledger)).toEqual(ok([]));
			expect(await Uploads.listImports(ledger, ledger.owner)).toEqual(ok([]));
		}));
});
