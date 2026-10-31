import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import type { Batch } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { inOrder, ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { readText, type Entry, type Storage } from '#lib/server/shared/storage/storage.ts';
import { coverOf, type Span } from '#lib/shared/dates.ts';
import { isCounted, STATEMENTS } from '#lib/shared/folders.ts';
import { enqueue, listJobs, type JobStatus } from '#services/jobs/application/jobs.ts';
import * as DB from '../adapters/database';
import * as Jobs from '../adapters/jobs';
import { embedTexts, MODEL } from '../adapters/prediction-model2vec';
import { formatQuantity, type Amount } from '../domain/amounts';
import { checkGroups } from '../domain/groups';
import { displayLocation, parse } from '../domain/parser';
import { plan, type SyncPlan } from '../domain/sync';
import { filled, wordsOf, type Unembedded } from '../domain/text';
import { DisposalKind, type Ledger, type RupeaFile } from '../domain/types';
import { openFolder } from './ledger';

// Past transactions embedded per sync, latest first. A sync that fills this
// queues the next, so a large ledger catches up without stalling one.
const EMBEDDED = 500;

export type Indexed = { failed: RupeaError[]; commodities: string[]; spans: Span[] };

/** What is wrong with the ledger: the problems sync kept, and what checking the ledger finds. */
export const listProblems = (l: Ledger): ResultAsync<Batch<never>> =>
	DB.listProblems(l.id).andThen((p) =>
		checkLedger(l).map((e) => ({ succeeded: [], failed: [...p, ...e] })),
	);

/** Queues a sync, for when a change to the ledger's files went unnoticed. */
export const sync = (l: Ledger): ResultAsync<void> =>
	enqueue({ job: Jobs.syncLedger, user: l.owner, payload: { ledger: l.handle } });

/** How the ledger's latest sync went, or null before its first. */
export const findSync = (ledger: Ledger): ResultAsync<JobStatus | null> =>
	listJobs({
		userId: ledger.owner,
		name: Jobs.syncLedger.name,
		payload: { ledger: ledger.handle },
		limit: 1,
	}).map((j) => j[0]?.status ?? null);

/** Brings the index up to date without checking the ledger, which costs a pass over every group. */
export const syncIndex = (ledger: Ledger): ResultAsync<RupeaError[]> =>
	openFolder({ ledger, folder: 'files' }).andThen((s) =>
		exclusively(ledger.id, () => listLedgerFiles(s).andThen((f) => update(s, ledger.id, f)))
			.orElse((e) => ok([e]))
			.andThen((f) => addProblems(ledger.id, f))
			.andThen((f) => queueFetches(ledger, f))
			.andThen((f) => embed(ledger, f)),
	);

/** Syncs the index as a job does, logging what failed, since nobody waits for its answer. */
export const syncLedger = (ledger: Ledger): ResultAsync<void> =>
	withContext('logger')((l) =>
		syncIndex(ledger)
			.andTee((f) => (f.length > 0 ? l.info({ failed: f }, 'synced with failures') : null))
			.map(() => undefined),
	);

/** Runs `f` in one transaction as the ledger's only writer, so what it indexes is settled with it or not at all. */
export const exclusively = <T>(id: string, f: () => ResultAsync<T>): ResultAsync<T> =>
	atomically(() => DB.lockLedger(id).andThen(f));

/** The ledger files in a ledger's files folder, leaving out the statements waiting there. */
export const listLedgerFiles = (storage: Storage): ResultAsync<Entry[]> =>
	storage
		.list()
		.mapErr((e) => fault('CannotReadDirectory', { path: '', cause: [e] }))
		.map((e) => e.filter((f) => f.key.endsWith('.rupea') && !f.key.startsWith(`${STATEMENTS}/`)));

type IndexFileOptions = { ledgerId: string; file: RupeaFile };

/** A file waiting for review keeps only its metadata, so where it came from is known, but nothing in it counts or fails. */
export const indexFile = ({ ledgerId, file }: IndexFileOptions): ResultAsync<Indexed> =>
	withContext('config')((config) => {
		const parsed = parse(config.ledger, file);
		const kept = isCounted(file.key)
			? parsed
			: { ...parsed, succeeded: [], prices: [], links: [], failed: [] };

		const indexed = {
			metadata: kept.metadata,
			transactions: kept.succeeded,
			prices: kept.prices,
			links: kept.links,
		};
		return DB.indexFile(ledgerId, {
			key: file.key,
			version: file.version,
			file: indexed,
			failed: kept.failed,
		}).map((t) => ({ failed: [], ...t }));
	});

type UnindexOptions = { ledgerId: string; key: string };

export const unindex = ({ ledgerId, key }: UnindexOptions): ResultAsync<Indexed> =>
	DB.unindexFile(ledgerId, key).map((t) => ({ failed: [], ...t }));

type SettleOptions = { ledgerId: string; indexed: Indexed };

/** Settles what spans files once indexed: which transactions count, then the lots, months and assertions they and the recount touched, and the accounts left unused. */
export const settle = ({ ledgerId, indexed }: SettleOptions): ResultAsync<RupeaError[]> =>
	uncountedIn(ledgerId)
		.andThen((u) => DB.recount(ledgerId, u))
		.andThen((r) => {
			const commodities = [...indexed.commodities, ...r.commodities];
			const span = coverOf([...indexed.spans, ...r.spans]);

			return rebook(ledgerId, commodities)
				.andThen(() => saveMonths(ledgerId, span))
				.andThen(() => DB.saveCheckedMonths(ledgerId))
				.andThen(() => saveChecks(ledgerId, span))
				.andThen(() => DB.deleteUnusedAccounts(ledgerId));
		})
		.map(() => indexed.failed);

/** Indexes one file at a time, each in a savepoint, so a step that fails is reported and leaves the others. */
export const indexEach = (steps: (() => ResultAsync<Indexed>)[]): ResultAsync<Indexed> =>
	inOrder(steps.map((s) => () => reported(atomically(s)))).map((done) => ({
		failed: done.flatMap((d) => d.failed),
		commodities: done.flatMap((d) => d.commodities),
		spans: done.flatMap((d) => d.spans),
	}));

export const checkLots = (l: Ledger): ResultAsync<RupeaError[]> =>
	DB.listUnmatched(l.id).map((u) => u.map(toLotError));

// Storage is listed under the lock, so a file a writer indexed meanwhile is
// listed too and never taken for gone. Most syncs find nothing changed, and
// then nothing needs settling. A settle that fails undoes what this sync
// indexed, so the next one tries again.
const update = (s: Storage, id: string, stored: Entry[]): ResultAsync<RupeaError[]> =>
	DB.listIndexedFiles(id).andThen((indexed) => {
		const p = plan(stored, indexed);
		return p.changed.length + p.gone.length === 0
			? okAsync([])
			: applyPlan(s, id, p).andThen((i) => settle({ ledgerId: id, indexed: i }));
	});

const applyPlan = (storage: Storage, ledgerId: string, p: SyncPlan): ResultAsync<Indexed> => {
	const reindex = (k: string) =>
		readText(storage, k).andThen((f) => indexFile({ ledgerId, file: f }));

	return indexEach([
		...p.changed.map((k) => () => reindex(k)),
		...p.gone.map((k) => () => unindex({ ledgerId, key: k })),
	]);
};

const reported = (i: ResultAsync<Indexed>): ResultAsync<Indexed> =>
	i.orElse((e) => ok({ failed: [e], commodities: [], spans: [] }));

/** What failed to parse is kept as a problem, so it is reported on every sync without parsing again. */
const addProblems = (id: string, f: RupeaError[]): ResultAsync<RupeaError[]> =>
	DB.listProblems(id)
		.map((p) => [...f, ...p])
		.orElse((e) => ok([...f, e]));

/** A symbol is fetched once a ledger links it, and again on later syncs until a fetch works. */
const queueFetches = (ledger: Ledger, failed: RupeaError[]): ResultAsync<RupeaError[]> =>
	DB.listUnfetched(ledger.id)
		.andThen((ids) =>
			inOrder(
				ids.map(
					(id) => () =>
						enqueue({ job: Jobs.fetchQuotes, user: ledger.owner, payload: { symbol: id } }),
				),
			),
		)
		.map(() => failed)
		.orElse((e) => ok([...failed, e]));

const embed = (ledger: Ledger, failed: RupeaError[]): ResultAsync<RupeaError[]> =>
	DB.listUnembedded(ledger.id, MODEL, EMBEDDED)
		.andThrough((r) => (r.length === 0 ? okAsync() : fill(ledger.id, r)))
		.andThen((r) => (r.length === EMBEDDED ? sync(ledger) : okAsync()))
		.map(() => failed)
		.orElse((e) => ok([...failed, e]));

const fill = (ledgerId: string, rows: Unembedded[]): ResultAsync<void> =>
	withContext('models')((models) => {
		const texts = wordsOf(rows.map((r) => r.description));
		const vectors = texts.length === 0 ? okAsync([]) : embedTexts(models, texts);
		return vectors.andThen((v) => DB.saveEmbeddings(ledgerId, MODEL, filled(rows, v)));
	});

// Groups and balances span files, so they are checked after every file is in
// place. Evidence is not counted: a group's money moves at its primary.
const checkLedger = (ledger: Ledger): ResultAsync<RupeaError[]> =>
	DB.listGroupTransactions(ledger.id)
		.map(checkGroups)
		.andThen((e) =>
			DB.listBalanceChecks(ledger.id).map((c) => [...e.failed, ...c.map(toBalanceError)]),
		)
		.andThen((f) => checkLots(ledger).map((l) => [...f, ...l]))
		.andThen((f) => checkLinks(ledger).map((l) => [...f, ...l]))
		.orElse((e) => ok([e]));

const checkLinks = (l: Ledger): ResultAsync<RupeaError[]> =>
	DB.listRepeatedLinks(l.id).map((r) =>
		r.map((k) =>
			fault('LinkRepeated', { location: k.locations.join(', '), commodity: k.commodity }),
		),
	);

const rebook = (id: string, commodities: string[]): ResultAsync<void> => {
	const lots = [...new Set(commodities)];
	return lots.length === 0 ? okAsync() : DB.rebook(id, lots);
};

const saveMonths = (id: string, s: Span | null): ResultAsync<void> =>
	s ? DB.saveMonthlyDeltas(id, s) : okAsync();

const saveChecks = (id: string, s: Span | null): ResultAsync<void> =>
	s ? DB.saveBalanceChecks(id, s.from) : okAsync();

const uncountedIn = (id: string): ResultAsync<string[]> =>
	DB.listGroupTransactions(id).map((m) => checkGroups(m).uncounted);

// An assertion that could go either way is not checked; a time on either side settles it.
const toBalanceError = (c: DB.BalanceCheck): RupeaError =>
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

const toLotError = (disposal: DB.UnmatchedDisposal): RupeaError =>
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
