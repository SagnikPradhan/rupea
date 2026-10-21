import { petName } from '#lib/server/shared/names.ts';
import { errAsync, ok, type Result, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { scoped, type Storage } from '#lib/server/shared/storage/storage.ts';
import { withStorage } from '#services/storage/application/storage.ts';
import { findLedger, findLedgers, insertLedger } from '../adapters/database';
import { files, type Files } from '../adapters/storage';
import { STATEMENTS } from '../domain/folders';
import type { Ledger } from '../domain/types';

export type { Ledger };

// A random handle clashes rarely enough that a few tries settle it.
const TRIES = 5;

type WithLedgerOptions<T> = {
	user: string;
	handle: string;
	action: (ledger: Ledger) => Result<T> | ResultAsync<T>;
};

// The one place that decides whether a user may reach a ledger.
export const withLedger = <T>(o: WithLedgerOptions<T>): ResultAsync<T> =>
	findLedger(o.user, o.handle).andThen(o.action);

export const listLedgers = (u: string): ResultAsync<Ledger[]> => findLedgers(u);

type CreateLedgerOptions = {
	user: string;
	name: string;
};

export const createLedger = (o: CreateLedgerOptions): ResultAsync<Ledger> => insertNamed(o, TRIES);

const insertNamed = (o: CreateLedgerOptions, n: number): ResultAsync<Ledger> =>
	insertLedger({ ...o, owner: o.user, handle: petName() }).orElse((e) =>
		e.type === 'NameTaken' && n > 1 ? insertNamed(o, n - 1) : errAsync(e),
	);

/** Statements wait for review among the files, beside what is imported from them. */
const FOLDERS = {
	files: 'files',
	statements: `files/${STATEMENTS}`,
	schemas: 'schemas',
};

/** One of a ledger's folders in its owner's storage, for a caller that reached the ledger through `withLedger`. */
export const openFolder = (l: Ledger, f: keyof typeof FOLDERS): ResultAsync<Storage> =>
	withStorage({
		user: l.owner,
		action: (s) => ok(scoped(s, `ledgers/${l.handle}/${FOLDERS[f]}`)),
	});

export const ledgerFiles = (l: Ledger): ResultAsync<Files> => openFolder(l, 'files').map(files);
