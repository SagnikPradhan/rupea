import { withContext } from '#lib/server/shared/context/context.ts';
import { findText, writeText } from '#lib/server/shared/storage/storage.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { currenciesFrom, setBase } from '../domain/base';
import type { Ledger } from '../domain/types';
import { MAIN, openFolder, readingOf } from './ledger';
import { reindex } from './sync';

/** The currencies a ledger's prices can value it in, its base among them. */
export const listCurrencies = (l: Ledger): ResultAsync<string[]> =>
	DB.listCurrencyPairs(l.id).map((p) => currenciesFrom(p, l.base));

type SaveBaseOptions = { ledger: Ledger; base: string };

/**
 * Writes the base atop main.rupea, made if it is missing, and reads the ledger
 * again in it; written only if the file is unchanged since it was read.
 */
export const saveBase = ({ ledger, base }: SaveBaseOptions): ResultAsync<void> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		findText(s, MAIN).andThen((f) =>
			withContext('config')((c) =>
				setBase(readingOf(c, ledger), { file: { key: MAIN, content: f?.content ?? '' }, base }),
			).asyncAndThen((t) =>
				writeText(s, { key: MAIN, content: t, ifVersion: f?.version ?? null })
					.andTee((w) => reindex({ ledgerId: ledger.id, storage: s, changed: [w.key] }))
					.map(() => undefined),
			),
		),
	);
