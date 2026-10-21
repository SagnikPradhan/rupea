import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { ok, okAsync, ResultAsync, sequence } from '#lib/server/shared/result/result.ts';
import { index, type BalanceCheck, type UnmatchedDisposal } from '../adapters/database';
import { embedder, MODEL } from '../adapters/prediction-onnx';
import type { Files } from '../adapters/storage';
import { formatQuantity, type Amount } from '../domain/amounts';
import { checkEvents } from '../domain/events';
import { isCounted } from '../domain/folders';
import { displayLocation, parse } from '../domain/parser';
import { indexedVersion, plan, type SyncPlan } from '../domain/sync';
import { filling, type Unembedded } from '../domain/text';
import { DisposalKind, type Ledger, type RupeeFile } from '../domain/types';
import { ledgerFiles } from './ledger';

// Past transactions embedded per sync, latest first, so a large ledger
// catches up over a few syncs instead of stalling one.
const EMBEDDED = 500;

/** Brings the index up to date and checks the ledger, reporting what is wrong with either. */
export const sync = (l: Ledger): ResultAsync<RupeeError[]> =>
	syncIndex(l).andThen((f) => checkLedger(l.id).map((e) => [...f, ...e]));

/** Brings the index up to date without checking the ledger, which costs a pass over every event and balance assertion. */
export const syncIndex = (ledger: Ledger): ResultAsync<RupeeError[]> =>
	ledgerFiles(ledger).andThen((f) =>
		ResultAsync.combine([f.entries(), index(ledger.id).files()])
			.andThen(([stored, indexed]) => applyPlan(f, ledger.id, plan(stored, indexed)))
			.andThen((a) => rebook(ledger.id, a))
			.andThen((e) => embed(ledger.id, e)),
	);

export type Indexed = { failed: RupeeError[]; touched: string[] };

// One file at a time, since embedded Postgres has one connection. A failed
// step is reported, not fatal; failing to list either side is.
const applyPlan = (files: Files, ledgerId: string, p: SyncPlan): ResultAsync<Indexed> => {
	const steps = [
		...p.changed.map((k) => () => reindex(files, ledgerId, k)),
		...p.gone.map((k) => () => unindex(ledgerId, k)),
	];

	return sequence(steps.map((s) => () => attempt(s))).map((done) => ({
		failed: done.flatMap((d) => d.failed),
		touched: done.flatMap((d) => d.touched),
	}));
};

const attempt = (s: () => ResultAsync<Indexed>): ResultAsync<Indexed[]> =>
	s()
		.map((i) => [i])
		.orElse((e) => ok([{ failed: [e], touched: [] }]));

const reindex = (f: Files, l: string, k: string): ResultAsync<Indexed> =>
	f.read(k).andThen((r) => indexFile(l, r));

/** A file waiting for review keeps only its metadata: what it cites is known, but nothing in it counts or fails. */
export const indexFile = (ledgerId: string, file: RupeeFile): ResultAsync<Indexed> =>
	withContext('config')((config) => {
		const parsed = parse(config.ledger, file);
		const kept = isCounted(file.key)
			? parsed
			: { ...parsed, succeeded: [], prices: [], failed: [] };
		return index(ledgerId)
			.put(file.key, indexedVersion(file.version, kept.failed), {
				metadata: kept.metadata,
				transactions: kept.succeeded,
				prices: kept.prices,
			})
			.map((t) => ({ failed: kept.failed, touched: t }));
	});

export const unindex = (li: string, k: string): ResultAsync<Indexed> =>
	index(li)
		.remove(k)
		.map((t) => ({ failed: [], touched: t }));

export const rebook = (ledgerId: string, indexed: Indexed): ResultAsync<RupeeError[]> => {
	const commodities = [...new Set(indexed.touched)];
	if (commodities.length === 0) return okAsync(indexed.failed);

	return uncountedIn(ledgerId)
		.andThen((e) => index(ledgerId).rebook(commodities, e))
		.map(() => indexed.failed)
		.orElse((e) => ok([...indexed.failed, e]));
};

const embed = (ledgerId: string, failed: RupeeError[]): ResultAsync<RupeeError[]> =>
	index(ledgerId)
		.unembedded(MODEL, EMBEDDED)
		.andThen((r) => (r.length === 0 ? okAsync(undefined) : fill(ledgerId, r)))
		.map(() => failed)
		.orElse((e) => ok([...failed, e]));

const fill = (ledgerId: string, rows: Unembedded[]): ResultAsync<void> =>
	withContext('models')((models) => {
		const f = filling(rows);
		const vectors = f.texts.length === 0 ? okAsync([]) : embedder(models)(f.texts);
		return vectors.andThen((v) => index(ledgerId).fill(MODEL, f.fill(v)));
	});

// Events and balances span files, so they are checked after every file is in place.
const checkLedger = (ledgerId: string): ResultAsync<RupeeError[]> =>
	index(ledgerId)
		.eventMembers()
		.map(checkEvents)
		.andThen((e) => checkBalances(ledgerId, e.uncounted).map((b) => [...e.failed, ...b]))
		.andThen((f) => checkLots(ledgerId).map((l) => [...f, ...l]))
		.orElse((e) => ok([e]));

export const uncountedIn = (l: string): ResultAsync<string[]> =>
	index(l)
		.eventMembers()
		.map((m) => checkEvents(m).uncounted);

// Evidence is not counted: an event's money moves at its primary.
export const checkBalances = (l: string, e: string[]): ResultAsync<RupeeError[]> =>
	index(l)
		.balanceChecks(e)
		.map((c) => c.map(toBalanceError));

// An assertion that could go either way is not checked; a time on either side settles it.
const toBalanceError = (c: BalanceCheck): RupeeError =>
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

export const checkLots = (l: string): ResultAsync<RupeeError[]> =>
	index(l)
		.unmatched()
		.map((u) => u.map(toLotError));

const toLotError = (disposal: UnmatchedDisposal): RupeeError =>
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
