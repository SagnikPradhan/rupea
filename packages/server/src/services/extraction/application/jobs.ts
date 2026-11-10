import type { Job } from '#services/jobs/application/jobs.ts';
import * as v from 'valibot';

const ImportPayload = v.object({ ledger: v.string(), checksum: v.string(), name: v.string() });

export type ImportPayload = v.InferOutput<typeof ImportPayload>;

/**
 * Drafts an upload for review; one ledger's imports run one at a time, so their
 * rebooks never race.
 */
export const importStatement: Job<ImportPayload> = {
	name: 'import-statement',
	version: 1,
	payload: ImportPayload,
	partition: (p) => p.ledger,
	dedupe: (p) => `${p.ledger}:${p.checksum}`,
};
