import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { inOrder, ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { readText, type Entry, type Storage } from '#lib/server/shared/storage/storage.ts';
import type { Span } from '#lib/shared/dates.ts';
import { isCounted, STATEMENTS } from '#lib/shared/folders.ts';
import * as DB from '../adapters/database';
import { parseChanged } from '../domain/parser';
import type { RupeaFile } from '../domain/types';

export const UNTOUCHED: DB.Touched = { commodities: [], spans: [], holdings: [], grouped: false };

export type Indexed = {
	failed: RupeaError[];
	commodities: string[];
	spans: Span[];
	holdings: DB.HoldingKey[];
	grouped: boolean;
};

/** What indexing and recounting touched, merged: the commodities to rebook, the days to total again, and the holdings they post to. */
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

/** The ledger files in a ledger's files folder, leaving out the statements waiting there. */
export const listLedgerFiles = (storage: Storage): ResultAsync<Entry[]> =>
	storage
		.list()
		.mapErr((e) => fault('CannotReadDirectory', { path: '', cause: [e] }))
		.map((e) => e.filter((f) => f.key.endsWith('.rupea') && !f.key.startsWith(`${STATEMENTS}/`)));

/** Indexes one file at a time, each in a savepoint, so a file that fails is reported and leaves the others. */
export const indexEach = ({
	ledgerId,
	storage,
	changed = [],
	moved = [],
	gone = [],
	full = false,
}: ReindexOptions): ResultAsync<Indexed> => {
	const read = (k: string) =>
		readText(storage, k).andThen((f) => indexFile({ ledgerId, file: f, full }));

	/** A move between counted and review folders changes what the file counts, so it is indexed again; otherwise only its key changes. */
	const move = ({ from, to }: Move): ResultAsync<Indexed> =>
		DB.renameIndexedFile(ledgerId, from, to).andThen((t) =>
			isCounted(from) === isCounted(to) ? okAsync({ failed: [], ...t }) : read(to),
		);

	const work = [
		...changed.map((k) => () => read(k)),
		...moved.map((m) => () => move(m)),
		...gone.map((k) => () => unindex({ ledgerId, key: k })),
	];

	return inOrder(work.map((w) => () => reported(atomically(w)))).map((done) => ({
		failed: done.flatMap((d) => d.failed),
		commodities: done.flatMap((d) => d.commodities),
		spans: done.flatMap((d) => d.spans),
		holdings: done.flatMap((d) => d.holdings),
		grouped: done.some((d) => d.grouped),
	}));
};

type IndexFileOptions = { ledgerId: string; file: RupeaFile; full: boolean };

/** A file waiting for review keeps only its metadata, so where it came from is known, but nothing in it counts or fails. */
const indexFile = ({ ledgerId, file, full }: IndexFileOptions): ResultAsync<Indexed> =>
	withContext('config')((config) =>
		DB.findHeld(ledgerId, file.key).andThen((held) => {
			const inLedger = isCounted(file.key);
			const parsed = parseChanged(config.ledger, file, inLedger && !full ? held.hashCounts : {});
			const found = inLedger
				? parsed
				: { ...parsed, succeeded: [], prices: [], links: [], failed: [] };

			return DB.indexFile(ledgerId, {
				key: file.key,
				version: file.version,
				file: {
					metadata: found.metadata,
					transactions: found.succeeded,
					prices: found.prices,
					links: found.links,
				},
				failed: found.failed,
				held,
				unchanged: found.unchanged,
				lineHashes: found.lineHashes,
			}).map((t) => ({ failed: [], ...t }));
		}),
	);

type UnindexOptions = { ledgerId: string; key: string };

const unindex = ({ ledgerId, key }: UnindexOptions): ResultAsync<Indexed> =>
	DB.unindexFile(ledgerId, key).map((t) => ({ failed: [], ...t }));

const reported = (i: ResultAsync<Indexed>): ResultAsync<Indexed> =>
	i.orElse((e) => ok({ failed: [e], ...UNTOUCHED }));
