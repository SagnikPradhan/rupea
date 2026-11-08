import { withContext } from '#lib/server/shared/context/context.ts';
import { findText, writeText } from '#lib/server/shared/storage/storage.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { setTerms } from '../domain/terms';
import type { Ledger } from '../domain/types';
import { openFolder } from './ledger';
import { reindex } from './sync';

const MAIN = 'main.rupea';

export type { TermsRow } from '../adapters/database-terms';

/** The terms every A line of a ledger sets. */
export const listTerms = (l: Ledger): ResultAsync<DB.TermsRow[]> => DB.listTerms(l.id);

type SaveTermsOptions = { ledger: Ledger; account: string; entries: [string, string][] };

/**
 * Writes an account's terms into the file whose A * line already sets them, or
 * into main.rupea, made if it is missing; written only if the file is unchanged
 * since it was read.
 */
export const saveTerms = ({
	ledger,
	account,
	entries,
}: SaveTermsOptions): ResultAsync<{ file: string }> =>
	DB.listTerms(ledger.id).andThen((rows) => {
		const key = rows.find((r) => r.account === account && r.since === null)?.file ?? MAIN;

		return openFolder({ ledger, folder: 'files' }).andThen((s) =>
			findText(s, key).andThen((f) =>
				withContext('config')((c) =>
					setTerms(c.ledger, { file: { key, content: f?.content ?? '' }, account, terms: entries }),
				).asyncAndThen((t) =>
					writeText(s, { key, content: t, ifVersion: f?.version ?? null })
						.andTee((w) => reindex({ ledgerId: ledger.id, storage: s, changed: [w.key] }))
						.map((w) => ({ file: w.key })),
				),
			),
		);
	});
