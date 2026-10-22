import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import type { Batch } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { inOrder, ok, okAsync, ResultAsync } from '#lib/server/shared/result/result.ts';
import { readText, type Entry, type Storage } from '#lib/server/shared/storage/storage.ts';
import { isCounted, STATEMENTS } from '#lib/shared/folders.ts';
import * as DB from '../adapters/database';
import { embedTexts, MODEL } from '../adapters/prediction-onnx';
import { formatQuantity, type Amount } from '../domain/amounts';
import { checkEvents } from '../domain/events';
import { displayLocation, parse } from '../domain/parser';
import { plan, type SyncPlan } from '../domain/sync';
import { filled, wordsOf, type Unembedded } from '../domain/text';
import { DisposalKind, type Ledger, type RupeeFile } from '../domain/types';
import { openFolder } from './ledger';

// Past transactions embedded per sync, latest first, so a large ledger
// catches up over a few syncs instead of stalling one.
const EMBEDDED = 500;

export type Indexed = { failed: RupeeError[]; touched: string[]; commodities: string[] };

/** Brings the index up to date and checks the ledger, reporting what is wrong with either. */
export const sync = (l: Ledger): ResultAsync<Batch<never>> =>
	syncIndex(l).andThen((f) => checkLedger(l).map((e) => ({ succeeded: [], failed: [...f, ...e] })));

/** Brings the index up to date without checking the ledger, which costs a pass over every event and balance assertion. */
export const syncIndex = (ledger: Ledger): ResultAsync<RupeeError[]> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		exclusively(ledger.id, () =>
			ResultAsync.combine([listLedgerFiles(s), DB.listIndexedFiles(ledger.id)]).andThen(
				([stored, indexed]) => update(s, ledger.id, plan(stored, indexed)),
			),
		).andThen((f) => embed(ledger.id, f)),
	);

/** Runs `f` in one transaction as the ledger's only writer, so what it indexes is settled with it or not at all. */
export const exclusively = <T>(id: string, f: () => ResultAsync<T>): ResultAsync<T> =>
	atomically(() => DB.lockLedger(id).andThen(f));

/** The ledger files in a ledger's files folder, leaving out the statements waiting there. */
export const listLedgerFiles = (storage: Storage): ResultAsync<Entry[]> =>
	storage
		.list()
		.mapErr((e) => fault('CannotReadDirectory', { path: '', cause: [e] }))
		.map((e) => e.filter((f) => f.key.endsWith('.rupee') && !f.key.startsWith(`${STATEMENTS}/`)));

type IndexFileOptions = { ledgerId: string; file: RupeeFile };

/** A file waiting for review keeps only its metadata, so where it came from is known, but nothing in it counts or fails. */
export const indexFile = ({ ledgerId, file }: IndexFileOptions): ResultAsync<Indexed> =>
	withContext('config')((config) => {
		const parsed = parse(config.ledger, file);
		const kept = isCounted(file.key)
			? parsed
			: { ...parsed, succeeded: [], prices: [], failed: [] };

		// A file with errors is indexed without a version, so every sync parses
		// it again and reports them until they are fixed.
		const version = kept.failed.length === 0 ? file.version : null;
		const indexed = { metadata: kept.metadata, transactions: kept.succeeded, prices: kept.prices };
		return DB.indexFile(ledgerId, { key: file.key, version, file: indexed }).map((t) => ({
			failed: kept.failed,
			touched: t.lots,
			commodities: t.commodities,
		}));
	});

type UnindexOptions = { ledgerId: string; key: string };

export const unindex = ({ ledgerId, key }: UnindexOptions): ResultAsync<Indexed> =>
	DB.unindexFile(ledgerId, key).map((t) => ({
		failed: [],
		touched: t.lots,
		commodities: t.commodities,
	}));

type SettleOptions = { ledgerId: string; indexed: Indexed };

/** Settles what spans files once they are indexed: which transactions count, then the balances and lots they make. */
export const settle = ({ ledgerId, indexed }: SettleOptions): ResultAsync<RupeeError[]> =>
	uncountedIn(ledgerId)
		.andThen((u) => DB.recount(ledgerId, u).map((r) => ({ u, r })))
		.andThen(({ u, r }) => {
			const commodities = [...new Set([...indexed.commodities, ...r.commodities])];
			const lots = [...new Set([...indexed.touched, ...r.lots])];
			return DB.rebalance(ledgerId, commodities).andThen(() =>
				lots.length === 0 ? okAsync() : DB.rebook(ledgerId, lots, u),
			);
		})
		.map(() => indexed.failed);

/** Indexes one file at a time, each in a savepoint, so a step that fails is reported and leaves the others. */
export const indexEach = (steps: (() => ResultAsync<Indexed>)[]): ResultAsync<Indexed> =>
	inOrder(steps.map((s) => () => reported(atomically(s)))).map((done) => ({
		failed: done.flatMap((d) => d.failed),
		touched: done.flatMap((d) => d.touched),
		commodities: done.flatMap((d) => d.commodities),
	}));

export const checkLots = (l: Ledger): ResultAsync<RupeeError[]> =>
	DB.listUnmatched(l.id).map((u) => u.map(toLotError));

// Most syncs find nothing changed, and then nothing needs settling. A settle
// that fails is reported, and undoes what this sync indexed, so the next one
// tries again; failing to list either side is fatal.
const update = (s: Storage, id: string, p: SyncPlan): ResultAsync<RupeeError[]> =>
	p.changed.length + p.gone.length === 0
		? okAsync([])
		: atomically(() =>
				applyPlan(s, id, p).andThen((i) => settle({ ledgerId: id, indexed: i })),
			).orElse((e) => ok([e]));

const applyPlan = (storage: Storage, ledgerId: string, p: SyncPlan): ResultAsync<Indexed> => {
	const reindex = (k: string) =>
		readText(storage, k).andThen((f) => indexFile({ ledgerId, file: f }));

	return indexEach([
		...p.changed.map((k) => () => reindex(k)),
		...p.gone.map((k) => () => unindex({ ledgerId, key: k })),
	]);
};

const reported = (i: ResultAsync<Indexed>): ResultAsync<Indexed> =>
	i.orElse((e) => ok({ failed: [e], touched: [], commodities: [] }));

const embed = (ledgerId: string, failed: RupeeError[]): ResultAsync<RupeeError[]> =>
	DB.listUnembedded(ledgerId, MODEL, EMBEDDED)
		.andThen((r) => (r.length === 0 ? okAsync(undefined) : fill(ledgerId, r)))
		.map(() => failed)
		.orElse((e) => ok([...failed, e]));

const fill = (ledgerId: string, rows: Unembedded[]): ResultAsync<void> =>
	withContext('models')((models) => {
		const texts = wordsOf(rows.map((r) => r.description));
		const vectors = texts.length === 0 ? okAsync([]) : embedTexts(models, texts);
		return vectors.andThen((v) => DB.saveEmbeddings(ledgerId, MODEL, filled(rows, v)));
	});

// Events and balances span files, so they are checked after every file is in
// place. Evidence is not counted: an event's money moves at its primary.
const checkLedger = (ledger: Ledger): ResultAsync<RupeeError[]> =>
	DB.listEventTransactions(ledger.id)
		.map(checkEvents)
		.andThen((e) =>
			DB.listBalanceChecks(ledger.id, e.uncounted).map((c) => [
				...e.failed,
				...c.map(toBalanceError),
			]),
		)
		.andThen((f) => checkLots(ledger).map((l) => [...f, ...l]))
		.orElse((e) => ok([e]));

const uncountedIn = (id: string): ResultAsync<string[]> =>
	DB.listEventTransactions(id).map((m) => checkEvents(m).uncounted);

// An assertion that could go either way is not checked; a time on either side settles it.
const toBalanceError = (c: DB.BalanceCheck): RupeeError =>
	c.unordered.length > 0
		? fault('BalanceAssertionAmbiguous', {
				location: displayLocation(c.location),
				account: c.account,
				unordered: c.unordered.join(', '),
			})
		: fault('BalanceAssertionFailed', {
				location: displayLocation(c.location),
				account: c.account,
				expected: formatQuantity({ amount: c.expected, commodity: c.commodity }),
				actual: formatQuantity({ amount: c.actual, commodity: c.commodity }),
			});

const toLotError = (disposal: DB.UnmatchedDisposal): RupeeError =>
	disposal.kind === DisposalKind.Sale && !disposal.named
		? fault('LotCostMissing', {
				location: displayLocation(disposal.location),
				account: disposal.account,
			})
		: fault('LotNotOpen', {
				location: displayLocation(disposal.location),
				account: disposal.account,
				units: formatQuantity({ amount: -disposal.units as Amount, commodity: disposal.commodity }),
			});
