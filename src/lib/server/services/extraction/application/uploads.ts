import { atomically } from '#lib/server/db/atomically.ts';
import { batch, type Batch } from '#lib/server/shared/result/batch.ts';
import {
	err,
	ok,
	okAsync,
	sequence,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result/result.ts';
import { enqueue, listJobs, type UserJob } from '#services/jobs/application/jobs.ts';
import { findCited } from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { findRecentStatements, type StatementRow } from '../adapters/database';
import { importStatement } from '../adapters/jobs';
import { isText, type Upload } from '../adapters/reader';
import * as v from 'valibot';
import { storeStatement } from './statements';

/** The latest uploads the inbox looks through, so it never scans a ledger's whole history. */
const RECENT = 200;
const JOBS_SHOWN = 50;

type UploadOptions = {
	ledger: Ledger;
	user: string;
	uploads: Upload[];
};

/** Stores each upload, and queues the import of a ledger file with it; one failing does not stop the rest. */
export const uploadStatements = (o: UploadOptions): ResultAsync<Batch<string>> =>
	sequence(o.uploads.map((u) => () => attemptUpload(o, u))).map(batch);

/** Statements uploaded lately that wait for a schema to read them, as no file cites them yet. */
export const listInbox = (ledger: Ledger): ResultAsync<StatementRow[]> =>
	findRecentStatements(ledger.id, RECENT).andThen((recent) => {
		const unread = recent.filter((r) => !isText(r.key));
		const checksums = unread.map((r) => r.checksum);
		return findCited(ledger, checksums).map((c) => unread.filter((r) => !c.includes(r.checksum)));
	});

/** The imports a user queued in this ledger, newest first. */
export const listImports = (ledger: Ledger, user: string) =>
	listJobs({
		userId: user,
		name: importStatement.name,
		payload: { ledger: ledger.handle },
		limit: JOBS_SHOWN,
	}).map((a) => a.map(viewImport));

const viewImport = (j: UserJob) => ({
	id: j.id,
	status: j.status,
	statement: v.parse(importStatement.payload, j.payload).statement,
	error: j.error,
});

const attemptUpload = (o: UploadOptions, u: Upload): ResultAsync<Result<string>[]> =>
	uploadOne(o, u)
		.map((k) => [ok(k)])
		.orElse((e) => okAsync([err(e)]));

const uploadOne = (o: UploadOptions, upload: Upload): ResultAsync<string> =>
	atomically(() =>
		storeStatement(o.ledger, upload).andThen((s) =>
			isText(s.key)
				? enqueue({
						job: importStatement,
						user: o.user,
						payload: { ledger: o.ledger.handle, checksum: s.checksum, statement: s.key },
					}).map(() => s.key)
				: okAsync(s.key),
		),
	);
