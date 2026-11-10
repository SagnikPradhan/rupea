import { withContext } from '#lib/server/shared/context/context.ts';
import { findText, writeText } from '#lib/server/shared/storage/storage.ts';
import { fault } from '@rupea/shared/error.ts';
import { errAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { setTerms, termsOn } from '../domain/terms';
import type { Ledger } from '../domain/types';
import { openFolder } from './ledger';
import { reindex } from './sync';

const MAIN = 'main.rupea';

type ListTermsOptions = { ledger: Ledger; day: string };

/**
 * What the A lines of a ledger set up each account with on a day: the A * line
 * as written, for editing, and the terms it and the dated lines hold together.
 */
export const listTerms = ({ ledger, day }: ListTermsOptions) =>
	DB.listTerms(ledger.id).map((r) => termsOn(r, day));

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
		const stars = rows.filter(
			(r) => r.since === null && r.account.toLowerCase() === account.toLowerCase(),
		);
		const key = stars[0]?.file ?? MAIN;
		if (stars.length > 1)
			return errAsync(
				fault('AccountRepeated', {
					location: stars.map((r) => `${r.file}:${r.line}`).join(', '),
					account,
				}),
			);

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
