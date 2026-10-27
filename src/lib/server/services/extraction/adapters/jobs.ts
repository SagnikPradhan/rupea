import type { Job } from '#services/jobs/application/jobs.ts';
import { withLedger } from '#services/ledger/application/ledger.ts';
import * as v from 'valibot';
import { draftUpload } from '../application/drafts';

const ImportPayload = v.object({ ledger: v.string(), checksum: v.string(), name: v.string() });

/** Drafts an upload for review; one ledger's imports run one at a time, so their rebooks never race. */
export const importStatement: Job<v.InferOutput<typeof ImportPayload>> = {
	name: 'import-statement',
	version: 1,
	payload: ImportPayload,
	partition: (p) => p.ledger,
	dedupe: (p) => `${p.ledger}:${p.checksum}`,
	run: (p, u) =>
		withLedger({
			user: u,
			handle: p.ledger,
			action: (l) => draftUpload({ ledger: l, checksum: p.checksum }),
		}),
};
