import type { Handler } from '#services/jobs/application/jobs.ts';
import { withLedger } from '#services/ledger/application/ledger.ts';
import { draftUpload } from '../application/drafts';
import { importStatement, type ImportPayload } from '../application/jobs';

const importing: Handler<ImportPayload> = {
	job: importStatement,
	run: (p, u) =>
		withLedger({
			user: u,
			handle: p.ledger,
			action: (l) => draftUpload({ ledger: l, checksum: p.checksum }),
		}),
};

/** Every job extraction runs. */
export const handlers: Handler<unknown>[] = [importing];
