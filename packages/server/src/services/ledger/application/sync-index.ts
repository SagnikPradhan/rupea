import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeaError } from '@rupea/shared/errors.ts';
import { inOrder, ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { readText, type Entry, type Storage } from '#lib/server/shared/storage/storage.ts';
import type { Span } from '@rupea/shared/dates.ts';
import { isCounted } from '@rupea/shared/files.ts';
import * as DB from '../adapters/database';
import { DEFAULT_COMMODITY } from '../domain/amounts';
import { baseOf, parseChanged } from '../domain/parser';
import type { RupeaFile, RupeaMetadata } from '../domain/types';
import { MAIN } from './ledger';

export const UNTOUCHED: DB.Touched = { commodities: [], spans: [], holdings: [], grouped: false };

export type Indexed = {
	failed: RupeaError[];
	/** The base main.rupea names, when it was read or removed. */
	base: string | null;
	commodities: string[];
	spans: Span[];
	holdings: DB.HoldingKey[];
	grouped: boolean;
};

/**
 * What indexing and recounting touched, merged: the commodities to rebook, the
 * days to total again, and the holdings they post to.
 */
export type Settling = { commodities: string[]; span: Span | null; holdings: DB.HoldingKey[] };

export type Move = { from: string; to: string };

export type ReindexOptions = {
	ledgerId: string;
	storage: Storage;
	changed?: string[];
	moved?: Move[];
	gone?: string[];
	/** Parses every line again, rather than only those that changed. */
	full?: boolean;
};

/**
 * The ledger files in a ledger's files folder, leaving out the statements
 * waiting there.
 */
export const listLedgerFiles = (storage: Storage): ResultAsync<Entry[]> =>
	storage
		.list()
		.mapErr((e) => fault('CannotReadDirectory', { path: '', cause: [e] }))
		.map((e) => e.filter((f) => f.key.endsWith('.rupea')));

type IndexEachOptions = {
	ledgerId: string;
	storage: Storage;
	changed?: string[];
	moved?: Move[];
	gone?: string[];
	full?: boolean;
	/** The currency a bare amount is read in. */
	base: string;
};

/**
 * Indexes one file at a time, each in a savepoint, so a file that fails is
 * reported and leaves the others.
 */
export const indexEach = ({
	ledgerId,
	storage,
	changed = [],
	moved = [],
	gone = [],
	full = false,
	base,
}: IndexEachOptions): ResultAsync<Indexed> => {
	const read = (k: string) =>
		readText(storage, k).andThen((f) => indexFile({ ledgerId, file: f, full, base }));

	/**
	 * A move between counted and review folders changes what the file counts, so
	 * it is indexed again; otherwise only its key changes.
	 */
	const move = ({ from, to }: Move): ResultAsync<Indexed> =>
		DB.renameIndexedFile(ledgerId, from, to).andThen((t) =>
			isCounted(from) === isCounted(to) ? okAsync({ failed: [], base: null, ...t }) : read(to),
		);

	const work = [
		...changed.map((k) => () => read(k)),
		...moved.map((m) => () => move(m)),
		...gone.map((k) => () => unindex({ ledgerId, key: k })),
	];

	return inOrder(work.map((w) => () => reported(atomically(w)))).map((done) => ({
		failed: done.flatMap((d) => d.failed),
		base: done.findLast((d) => d.base !== null)?.base ?? null,
		commodities: done.flatMap((d) => d.commodities),
		spans: done.flatMap((d) => d.spans),
		holdings: done.flatMap((d) => d.holdings),
		grouped: done.some((d) => d.grouped),
	}));
};

type IndexFileOptions = { ledgerId: string; file: RupeaFile; full: boolean; base: string };

/**
 * A file waiting for review keeps only its metadata, so where it came from is
 * known, but nothing in it counts or fails.
 */
const indexFile = ({ ledgerId, file, full, base }: IndexFileOptions): ResultAsync<Indexed> =>
	withContext('config')((config) =>
		DB.findHeld(ledgerId, file.key).andThen((held) => {
			const inLedger = isCounted(file.key);
			const known = inLedger && !full ? held.hashCounts : {};
			const parsed = parseChanged({ reading: { ...config.ledger, base }, file, known });
			const found = inLedger
				? parsed
				: {
						...parsed,
						succeeded: [],
						prices: [],
						links: [],
						accounts: [],
						budgets: [],
						failed: [],
					};

			return DB.indexFile(ledgerId, {
				key: file.key,
				version: file.version,
				file: {
					metadata: found.metadata,
					transactions: found.succeeded,
					prices: found.prices,
					links: found.links,
					accounts: found.accounts,
					budgets: found.budgets,
				},
				failed: found.failed,
				held,
				unchanged: found.unchanged,
				lineHashes: found.lineHashes,
			}).map((t) => ({ failed: [], base: baseIn(file.key, found.metadata), ...t }));
		}),
	);

const baseIn = (k: string, m: RupeaMetadata) =>
	k === MAIN ? (baseOf(m) ?? DEFAULT_COMMODITY) : null;

type UnindexOptions = { ledgerId: string; key: string };

const unindex = ({ ledgerId, key }: UnindexOptions): ResultAsync<Indexed> =>
	DB.unindexFile(ledgerId, key).map((t) => ({
		failed: [],
		base: key === MAIN ? DEFAULT_COMMODITY : null,
		...t,
	}));

const reported = (i: ResultAsync<Indexed>): ResultAsync<Indexed> =>
	i.orElse((e) => ok({ failed: [e], base: null, ...UNTOUCHED }));
