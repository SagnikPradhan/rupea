import { withContext } from '#lib/server/shared/context.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import { concat, ok, ResultAsync, type Batch, type Result } from '#lib/server/shared/result.ts';
import { scoped } from '#lib/server/shared/storage/storage.ts';
import {
	findLedgerId,
	index,
	type BalanceCheck,
	type CandidatePair,
	type IndexedTransaction,
} from '../adapters/database';
import { files } from '../adapters/storage';
import { checkEvents } from '../domain/events';
import { displayLocation, parse } from '../domain/parser';
import { indexedVersion, plan } from '../domain/sync';
import { formatQuantity, type RupeeFile, type RupeeTransaction } from '../domain/types';

export type { IndexedTransaction };

export const withLedger = <T>(
	u: string,
	s: (ledgerId: string) => Result<T> | ResultAsync<T>,
): ResultAsync<T> => findLedgerId(u).andThen(s);

const ledgerFiles = (l: string) => withContext('storage')((s) => files(scoped(s, `ledgers/${l}`)));

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

const reindex = (li: string, k: string): ResultAsync<RupeeError[]> =>
	ledgerFiles(li)
		.read(k)
		.andThen((f) => indexFile(li, f));

const unindex = (li: string, k: string): ResultAsync<RupeeError[]> =>
	index(li)
		.remove(k)
		.map((): RupeeError[] => []);

// One file at a time, since embedded Postgres has one connection. A failed
// step is reported, not fatal; failing to list either side is.
const syncFiles = (ledgerId: string): ResultAsync<RupeeError[]> =>
	ResultAsync.combine([ledgerFiles(ledgerId).entries(), index(ledgerId).files()]).andThen(
		([stored, indexed]) => {
			const p = plan(stored, indexed);
			return concat(
				[
					...p.changed.map((k) => () => reindex(ledgerId, k)),
					...p.gone.map((k) => () => unindex(ledgerId, k)),
				].map((s) => () => s().orElse((err) => ok([err]))),
			);
		},
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

const syncLedger = (l: string): ResultAsync<RupeeError[]> =>
	syncFiles(l).andThen((f) => checkLedger(l).map((e) => [...f, ...e]));

export const sync = (u: string): ResultAsync<RupeeError[]> => withLedger(u, syncLedger);

// For callers that need the index fresh but not the ledger's errors, which
// cost a pass over every event and balance assertion.
export const syncIndex = (u: string): ResultAsync<RupeeError[]> => withLedger(u, syncFiles);

export type CountedTransaction = IndexedTransaction & { counted: boolean };

export const getTransactions = (userId: string): ResultAsync<Batch<CountedTransaction>> =>
	withLedger(userId, (ledgerId) =>
		syncFiles(ledgerId).andThen((fl) =>
			index(ledgerId)
				.transactions()
				.map((t) => counting(t, fl))
				.andThen((c) =>
					checkBalances(ledgerId, c.evidence).map((b) => ({
						...c.batch,
						failed: [...c.batch.failed, ...b],
					})),
				),
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
export const findCandidates = (userId: string, key: string): ResultAsync<Candidates> =>
	withLedger(userId, (l) =>
		index(l)
			.candidates(key)
			.andThen((c) =>
				index(l)
					.byIds([...new Set(c.flatMap((p) => [p.ours, p.theirs]))])
					.map((t) => ({ pairs: c, transactions: t })),
			),
	);

export const isEventIdTaken = (u: string, id: string): ResultAsync<boolean> =>
	withLedger(u, (l) => index(l).eventIdTaken(id));

export const findEventsIn = (u: string, k: string): ResultAsync<IndexedTransaction[]> =>
	withLedger(u, (l) => index(l).eventsIn(k));

export const findEventMembers = (u: string, e: string): ResultAsync<IndexedTransaction[]> =>
	withLedger(u, (l) => index(l).membersOf(e));

export const listFiles = (u: string) => withLedger(u, (l) => ledgerFiles(l).list());

export const getFile = (u: string, k: string): ResultAsync<RupeeFile> =>
	withLedger(u, (l) => ledgerFiles(l).read(k));

export const check = (k: string, c: string): Batch<RupeeTransaction> =>
	withContext('config')((f) => parse(f, { key: k, content: c }));

type WriteFileOptions = {
	ledgerId: string;
	key: string;
	content: string;
	ifVersion: string | null;
};

// If indexing fails, the next sync picks the file up.
const writeFile = (options: WriteFileOptions): ResultAsync<RupeeFile> => {
	const { ledgerId, key, content, ifVersion } = options;
	return ledgerFiles(ledgerId)
		.write({ key, content, ifVersion })
		.andTee((w) => indexFile(ledgerId, w));
};

type CreateFileOptions = {
	userId: string;
	key: string;
	content: string;
};

export const createFile = (options: CreateFileOptions) => {
	const { userId, key, content } = options;
	return withLedger(userId, (l) => writeFile({ ledgerId: l, key, content, ifVersion: null }));
};

type EditFileOptions = CreateFileOptions & {
	version: string;
};

export const editFile = (options: EditFileOptions) => {
	const { userId, key, content, version } = options;
	return withLedger(userId, (l) => writeFile({ ledgerId: l, key, content, ifVersion: version }));
};

type RenameFileOptions = {
	userId: string;
	from: string;
	to: string;
};

export const renameFile = (options: RenameFileOptions): ResultAsync<RupeeFile> => {
	const { userId, from, to } = options;
	return withLedger(userId, (li) =>
		ledgerFiles(li)
			.rename(from, to)
			.andTee(() => index(li).rename(from, to)),
	);
};

export const deleteFile = (userId: string, key: string): ResultAsync<void> =>
	withLedger(userId, (li) =>
		ledgerFiles(li)
			.delete(key)
			.andTee(() => index(li).remove(key)),
	);
