import { atomically } from '#lib/server/db/atomically.ts';
import { batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { enqueue, listJobs, type UserJob } from '#services/jobs/application/jobs.ts';
import { findImported } from '#services/ledger/application/files.ts';
import { isCounted } from '#lib/shared/folders.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import * as DB from '../adapters/database';
import { importStatement } from '../adapters/jobs';
import { isText } from '../adapters/reader';
import type { Upload } from '../domain/types';
import * as v from 'valibot';
import { dropMissing, storeStatement } from './statements';

/** The latest uploads listed, so it never scans a ledger's whole history. */
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
export const uploadStatements = ({
	ledger,
	user,
	uploads,
}: UploadOptions): ResultAsync<Batch<Uploaded>> =>
	batchInOrder(uploads.map((u) => () => uploadOne({ ledger, user, upload: u })));

/** Statements uploaded lately, newest first, the file each was imported into, and whether a job imports it. */
export const listStatements = (
	ledger: Ledger,
): ResultAsync<{ key: string; file: string | null; queued: boolean }[]> =>
	DB.listRecentStatements(ledger.id, RECENT).andThen((recent) => {
		const checksums = recent.map((r) => r.checksum);
		return findImported({ ledger, checksums }).andThen((i) => {
			const keys = recent.map((r) => r.key);
			return dropMissing({ ledger, keys }).map((k) =>
				recent
					.filter((r) => k.includes(r.key))
					.map((r) => ({ key: r.key, file: fileOf(i, r.checksum), queued: isText(r.key) })),
			);
		});
	});

type ListImportsOptions = { ledger: Ledger; user: string };

/** The imports a user queued in this ledger, newest first. */
export const listImports = ({ ledger, user }: ListImportsOptions) =>
	listJobs({
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

type UploadOneOptions = { ledger: Ledger; user: string; upload: Upload };

const uploadOne = ({ ledger, user, upload }: UploadOneOptions): ResultAsync<Uploaded> =>
	atomically(() =>
		storeStatement({ ledger, upload }).andThen((s) =>
			isText(s.key)
				? enqueue({
						job: importStatement,
						user,
						payload: { ledger: ledger.handle, checksum: s.checksum, name: s.key },
					}).map(() => ({ key: s.key, queued: true }))
				: okAsync({ key: s.key, queued: false }),
		),
	);

// A statement can be in a draft and in a file it was added to; the counted file wins.
const fileOf = (imported: { checksum: string; file: string }[], checksum: string) => {
	const files = imported.filter((i) => i.checksum === checksum).map((i) => i.file);
	return files.find(isCounted) ?? files[0] ?? null;
};
