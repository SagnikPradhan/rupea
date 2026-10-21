import { atomically } from '#lib/server/db/atomically.ts';
import { batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { enqueue, findJobs, type UserJob } from '#services/jobs/application/jobs.ts';
import { findImported } from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { findRecentStatements, type StatementRow } from '../adapters/database';
import { importStatement } from '../adapters/jobs';
import { isText, type Upload } from '../adapters/reader';
import * as v from 'valibot';
import { dropMissing, storeStatement } from './statements';

/** The latest uploads the inbox looks through, so it never scans a ledger's whole history. */
const RECENT = 200;
const JOBS_SHOWN = 50;

type UploadOptions = {
	ledger: Ledger;
	user: string;
	uploads: Upload[];
};

/** A stored upload, and whether a job imports it, as it needs no schema. */
type Uploaded = { key: string; queued: boolean };

/** Stores each upload, and queues the import of a ledger file with it; one failing does not stop the rest. */
export const uploadStatements = (o: UploadOptions): ResultAsync<Batch<Uploaded>> =>
	batchInOrder(o.uploads.map((u) => () => uploadOne(o, u)));

/** Statements uploaded lately that wait for a schema to read them, as nothing was imported from them yet. */
export const listInbox = (ledger: Ledger): ResultAsync<StatementRow[]> =>
	findRecentStatements(ledger.id, RECENT).andThen((recent) => {
		const unread = recent.filter((r) => !isText(r.key));
		const checksums = unread.map((r) => r.checksum);
		return findImported(ledger, checksums).andThen((i) => {
			const waiting = unread.filter((r) => !i.includes(r.checksum));
			const keys = waiting.map((r) => r.key);
			return dropMissing(ledger, keys).map((k) => waiting.filter((r) => k.includes(r.key)));
		});
	});

/** The imports a user queued in this ledger, newest first. */
export const listImports = (ledger: Ledger, user: string) =>
	findJobs({
		userId: user,
		name: importStatement.name,
		payload: { ledger: ledger.handle },
		limit: JOBS_SHOWN,
	}).map((a) => a.flatMap(viewImport));

const viewImport = (j: UserJob) => {
	const payload = v.safeParse(importStatement.payload, j.payload);
	if (!payload.success) return [];

	return [{ id: j.id, status: j.status, statement: payload.output.name, error: j.error }];
};

const uploadOne = (o: UploadOptions, upload: Upload): ResultAsync<Uploaded> =>
	atomically(() =>
		storeStatement(o.ledger, upload).andThen((s) =>
			isText(s.key)
				? enqueue({
						job: importStatement,
						user: o.user,
						payload: { ledger: o.ledger.handle, checksum: s.checksum, name: s.key },
					}).map(() => ({ key: s.key, queued: true }))
				: okAsync({ key: s.key, queued: false }),
		),
	);
