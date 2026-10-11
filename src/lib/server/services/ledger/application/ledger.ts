import { withContext } from '#lib/server/shared/context.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import { petName } from '#lib/server/shared/names.ts';
import {
	concat,
	errAsync,
	ok,
	ResultAsync,
	type Batch,
	type Result,
} from '#lib/server/shared/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import * as Storage from '#services/storage/application/storage.ts';
import {
	findLedger,
	findLedgers,
	index,
	insertLedger,
	type BalanceCheck,
	type CandidatePair,
	type IndexedTransaction,
} from '../adapters/database';
import { files, type Files } from '../adapters/storage';
import { checkEvents } from '../domain/events';
import { displayLocation, parse } from '../domain/parser';
import { indexedVersion, plan } from '../domain/sync';
import {
	formatQuantity,
	type Ledger,
	type RupeeFile,
	type RupeeTransaction,
} from '../domain/types';

export type { IndexedTransaction, Ledger };

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

export const createLedger = (o: CreateLedgerOptions): ResultAsync<Ledger> =>
	Storage.ensureStorage(o.user).andThen((s) => insertNamed({ ...o, storage: s.id }, TRIES));

const insertNamed = (
	o: CreateLedgerOptions & { storage: string },
	n: number,
): ResultAsync<Ledger> =>
	insertLedger({ ...o, owner: o.user, handle: petName() }).orElse((e) =>
		e.type === 'NameTaken' && n > 1 ? insertNamed(o, n - 1) : errAsync(e),
	);

const ledgerFiles = (l: Ledger): ResultAsync<Files> =>
	Storage.withStorage({
		user: l.owner,
		action: (s) => ok(files(scoped(s, `ledgers/${l.handle}`))),
	});

const indexFile = (ledgerId: string, file: RupeeFile): ResultAsync<RupeeError[]> =>
	withContext('config')((config) => {
		const parsed = parse(config, file);
		return index(ledgerId)
			.put(file.key, indexedVersion(file.version, parsed.failed), {
				metadata: parsed.metadata,
				transactions: parsed.succeeded,
			})
			.map(() => parsed.failed);
	});

const reindex = (f: Files, l: string, k: string): ResultAsync<RupeeError[]> =>
	f.read(k).andThen((r) => indexFile(l, r));

const unindex = (li: string, k: string): ResultAsync<RupeeError[]> =>
	index(li)
		.remove(k)
		.map((): RupeeError[] => []);

// One file at a time, since embedded Postgres has one connection. A failed
// step is reported, not fatal; failing to list either side is.
const syncFiles = (ledger: Ledger): ResultAsync<RupeeError[]> =>
	ledgerFiles(ledger).andThen((files) =>
		ResultAsync.combine([files.entries(), index(ledger.id).files()]).andThen(
			([stored, indexed]) => {
				const p = plan(stored, indexed);
				return concat(
					[
						...p.changed.map((k) => () => reindex(files, ledger.id, k)),
						...p.gone.map((k) => () => unindex(ledger.id, k)),
					].map((s) => () => s().orElse((err) => ok([err]))),
				);
			},
		),
	);

// Events and balances span files, so they are checked after every file is in place.
const checkLedger = (ledgerId: string): ResultAsync<RupeeError[]> =>
	index(ledgerId)
		.eventMembers()
		.map(checkEvents)
		.andThen((e) => checkBalances(ledgerId, e.evidence).map((b) => [...e.failed, ...b]))
		.orElse((err) => ok([err]));

// Evidence is not counted: an event's money moves at its primary.
const checkBalances = (l: string, e: string[]): ResultAsync<RupeeError[]> =>
	index(l)
		.balanceChecks(e)
		.map((c) => c.map(toBalanceError));

// An assertion that could go either way is not checked; a time on either side settles it.
const toBalanceError = (c: BalanceCheck): RupeeError =>
	c.unordered.length > 0
		? {
				type: 'BalanceAssertionAmbiguous',
				location: displayLocation(c.location),
				account: c.account,
				unordered: c.unordered.join(', '),
				cause: [],
			}
		: {
				type: 'BalanceAssertionFailed',
				location: displayLocation(c.location),
				account: c.account,
				expected: formatQuantity({ amount: c.expected, commodity: c.commodity }),
				actual: formatQuantity({ amount: c.actual, commodity: c.commodity }),
				cause: [],
			};

export const sync = (l: Ledger): ResultAsync<RupeeError[]> =>
	syncFiles(l).andThen((f) => checkLedger(l.id).map((e) => [...f, ...e]));

// For callers that need the index fresh but not the ledger's errors, which
// cost a pass over every event and balance assertion.
export const syncIndex = (l: Ledger): ResultAsync<RupeeError[]> => syncFiles(l);

export type CountedTransaction = IndexedTransaction & { counted: boolean };

export const getTransactions = (l: Ledger): ResultAsync<Batch<CountedTransaction>> =>
	syncFiles(l).andThen((fl) =>
		index(l.id)
			.transactions()
			.map((t) => counting(t, fl))
			.andThen((c) =>
				checkBalances(l.id, c.evidence).map((b) => ({
					...c.batch,
					failed: [...c.batch.failed, ...b],
				})),
			),
	);

type Counting = { batch: Batch<CountedTransaction>; evidence: string[] };

// Evidence is kept but not counted.
const counting = (all: IndexedTransaction[], failed: RupeeError[]): Counting => {
	const events = checkEvents(all);
	const evidence = new Set(events.evidence);

	return {
		batch: {
			succeeded: all.map((t) => ({ ...t, counted: !evidence.has(t.id) })),
			failed: [...failed, ...events.failed],
		},
		evidence: events.evidence,
	};
};

export type Candidates = { pairs: CandidatePair[]; transactions: IndexedTransaction[] };

// Pairs a file's transactions could form events with, and both sides of each.
export const findCandidates = (ledger: Ledger, key: string): ResultAsync<Candidates> =>
	index(ledger.id)
		.candidates(key)
		.andThen((c) =>
			index(ledger.id)
				.byIds([...new Set(c.flatMap((p) => [p.ours, p.theirs]))])
				.map((t) => ({ pairs: c, transactions: t })),
		);

export const isEventIdTaken = (l: Ledger, id: string): ResultAsync<boolean> =>
	index(l.id).eventIdTaken(id);

export const findEventsIn = (l: Ledger, k: string): ResultAsync<IndexedTransaction[]> =>
	index(l.id).eventsIn(k);

export const findEventMembers = (l: Ledger, e: string): ResultAsync<IndexedTransaction[]> =>
	index(l.id).membersOf(e);

export const listFiles = (l: Ledger): ResultAsync<Batch<RupeeFile>> =>
	ledgerFiles(l).andThen((f) => f.list());

export const getFile = (l: Ledger, k: string): ResultAsync<RupeeFile> =>
	ledgerFiles(l).andThen((f) => f.read(k));

export const check = (k: string, c: string): Batch<RupeeTransaction> =>
	withContext('config')((f) => parse(f, { key: k, content: c }));

type WriteFileOptions = {
	ledger: Ledger;
	key: string;
	content: string;
	ifVersion: string | null;
};

// If indexing fails, the next sync picks the file up.
const writeFile = (options: WriteFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, key, content, ifVersion } = options;
	return ledgerFiles(ledger)
		.andThen((f) => f.write({ key, content, ifVersion }))
		.andTee((w) => indexFile(ledger.id, w));
};

type CreateFileOptions = {
	ledger: Ledger;
	key: string;
	content: string;
};

export const createFile = (o: CreateFileOptions): ResultAsync<RupeeFile> =>
	writeFile({ ...o, ifVersion: null });

type EditFileOptions = CreateFileOptions & {
	version: string;
};

export const editFile = (options: EditFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, key, content, version } = options;
	return writeFile({ ledger, key, content, ifVersion: version });
};

type RenameFileOptions = {
	ledger: Ledger;
	from: string;
	to: string;
};

export const renameFile = (options: RenameFileOptions): ResultAsync<RupeeFile> => {
	const { ledger, from, to } = options;
	return ledgerFiles(ledger)
		.andThen((f) => f.rename(from, to))
		.andTee(() => index(ledger.id).rename(from, to));
};

export const deleteFile = (l: Ledger, k: string): ResultAsync<void> =>
	ledgerFiles(l)
		.andThen((f) => f.delete(k))
		.andTee(() => index(l.id).remove(k));
