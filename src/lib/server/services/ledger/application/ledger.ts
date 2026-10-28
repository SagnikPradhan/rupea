import { petName } from '#lib/server/shared/names.ts';
import { errAsync, ok, type Result, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { scoped, type Storage } from '#lib/server/shared/storage/storage.ts';
import { withStorage } from '#services/storage/application/storage.ts';
import { STATEMENTS } from '#lib/shared/folders.ts';
import * as DB from '../adapters/database';
import type { Ledger } from '../domain/types';

export type { Ledger };

// A random handle clashes rarely enough that a few tries settle it.
const TRIES = 5;

/** Statements wait for review among the files, beside what is imported from them. */
const FOLDERS = {
	files: 'files',
	statements: `files/${STATEMENTS}`,
	schemas: 'schemas',
};

type WithLedgerOptions<T> = {
	user: string;
	handle: string;
	action: (ledger: Ledger) => Result<T> | ResultAsync<T>;
};

// The one place that decides whether a user may reach a ledger.
export const withLedger = <T>({ user, handle, action }: WithLedgerOptions<T>): ResultAsync<T> =>
	DB.findLedger(user, handle).andThen(action);

type ListLedgersOptions = { user: string };

export const listLedgers = ({ user }: ListLedgersOptions): ResultAsync<Ledger[]> =>
	DB.listLedgers(user);

type CreateLedgerOptions = {
	user: string;
	name: string;
};

export const createLedger = ({ user, name }: CreateLedgerOptions): ResultAsync<Ledger> =>
	createNamed({ user, name }, TRIES);

type OpenFolderOptions = {
	ledger: Ledger;
	folder: 'files' | 'statements' | 'schemas';
};

/** One of a ledger's folders in its owner's storage, for a caller that reached the ledger through `withLedger`. */
export const openFolder = ({ ledger, folder }: OpenFolderOptions): ResultAsync<Storage> =>
	withStorage({
		user: ledger.owner,
		action: (s) => ok(scoped(s, `ledgers/${ledger.handle}/${FOLDERS[folder]}`)),
	});

/** The handle of the ledger whose files hold a key of its owner's storage, counting the folders above them, since moving a folder reports only the folder. */
export const handleOf = (key: string): string | null => {
	const [top, handle, folder = FOLDERS.files] = key.split('/');
	return top === 'ledgers' && handle && folder === FOLDERS.files ? handle : null;
};

/** The day of the ledger's first transaction, before which no period can be picked, or none before it has one. */
export const findFirstDay = (l: Ledger): ResultAsync<Temporal.PlainDate | null> =>
	DB.findFirstDay(l.id);

const createNamed = ({ user, name }: CreateLedgerOptions, n: number): ResultAsync<Ledger> =>
	DB.createLedger({ owner: user, handle: petName(), name }).orElse((e) =>
		e.type === 'NameTaken' && n > 1 ? createNamed({ user, name }, n - 1) : errAsync(e),
	);
