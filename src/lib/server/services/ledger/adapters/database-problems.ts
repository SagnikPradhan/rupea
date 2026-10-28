import { withContext } from '#lib/server/shared/context/context.ts';
import type { RupeaError } from '#lib/server/shared/result/error.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';

/** A ledger's problems, by file and then in the order they were found. */
export const listProblems = (ledgerId: string): ResultAsync<RupeaError[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('problems')
				.leftJoin('ledgerFiles', 'ledgerFiles.id', 'problems.fileId')
				.select('problems.error')
				.where('problems.ledgerId', '=', ledgerId)
				.orderBy('ledgerFiles.key')
				.orderBy('problems.id')
				.execute(),
		).map((r) => r.map((p) => p.error)),
	);
