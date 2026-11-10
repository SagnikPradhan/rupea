import { withContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeaError } from '@rupea/shared/error.ts';
import { inOrder, ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { enqueue } from '#services/jobs/application/jobs.ts';
import * as DB from '../adapters/database';
import { embedTexts, MODEL } from '../adapters/prediction-model2vec';
import { formatQuantity, type Amount } from '../domain/amounts';
import { checkGroups } from '../domain/groups';
import type { UnmatchedDisposal } from '../domain/lots';
import { displayLocation } from '../domain/parser';
import { filled, wordsOf, type Unembedded } from '../domain/text';
import { DisposalKind, type Ledger } from '../domain/types';
import { fetchQuotes, syncLedger } from './jobs';

/**
 * Past transactions embedded per sync, latest first. A sync that fills this
 * queues the next, so a large ledger catches up without stalling one.
 */
const EMBEDDED = 500;

/**
 * What failed to parse is kept as a problem, so it is reported on every sync
 * without parsing again.
 */
export const addProblems = (l: Ledger, f: RupeaError[]): ResultAsync<RupeaError[]> =>
	DB.listProblems(l.id)
		.map((p) => [...f, ...p])
		.orElse((e) => ok([...f, e]));

/**
 * A symbol is fetched once a ledger links it, and again on the first sync of
 * each day, or on later syncs until a fetch works.
 */
export const queueFetches = (l: Ledger, f: RupeaError[]): ResultAsync<RupeaError[]> =>
	DB.listStale(l.id)
		.andThen((ids) =>
			inOrder(
				ids.map(
					(id) => () => enqueue({ job: fetchQuotes, user: l.owner, payload: { symbol: id } }),
				),
			),
		)
		.map(() => f)
		.orElse((e) => ok([...f, e]));

export const embed = (l: Ledger, f: RupeaError[]): ResultAsync<RupeaError[]> =>
	DB.listUnembedded(l.id, MODEL, EMBEDDED)
		.andThrough((r) => (r.length === 0 ? okAsync() : fill(l.id, r)))
		.andThen((r) => (r.length === EMBEDDED ? queueSync(l) : okAsync()))
		.map(() => f)
		.orElse((e) => ok([...f, e]));

/**
 * Groups and balances span files, so they are checked after every file is in
 * place. Evidence is not counted: a group's money moves at its primary.
 */
export const checkLedger = (l: Ledger): ResultAsync<RupeaError[]> =>
	DB.listGroupTransactions(l.id)
		.map(checkGroups)
		.andThen((e) => DB.listBalanceChecks(l.id).map((c) => [...e.failed, ...c.map(toBalanceError)]))
		.andThen((f) => checkLots(l).map((k) => [...f, ...k]))
		.andThen((f) => checkLinks(l).map((k) => [...f, ...k]))
		.andThen((f) => checkTerms(l).map((k) => [...f, ...k]))
		.orElse((e) => ok([e]));

export const checkLots = (l: Ledger): ResultAsync<RupeaError[]> =>
	DB.listUnmatched(l.id).map((u) => u.map(toLotError));

const queueSync = (l: Ledger): ResultAsync<void> =>
	enqueue({ job: syncLedger, user: l.owner, payload: { ledger: l.handle } });

const fill = (ledgerId: string, rows: Unembedded[]): ResultAsync<void> =>
	withContext('models')((models) => {
		const texts = wordsOf(rows.map((r) => r.description));
		const vectors = texts.length === 0 ? okAsync([]) : embedTexts(models, texts);
		return vectors.andThen((v) => DB.saveEmbeddings(ledgerId, MODEL, filled(rows, v)));
	});

const checkLinks = (l: Ledger): ResultAsync<RupeaError[]> =>
	DB.listRepeatedLinks(l.id).map((r) =>
		r.map((k) =>
			fault('LinkRepeated', { location: k.locations.join(', '), commodity: k.commodity }),
		),
	);

const checkTerms = (l: Ledger): ResultAsync<RupeaError[]> =>
	DB.listRepeatedTerms(l.id).map((r) =>
		r.map((k) =>
			fault('AccountRepeated', { location: k.locations.join(', '), account: k.account }),
		),
	);

/**
 * An assertion that could go either way is not checked; a time on either side
 * settles it.
 */
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

const toLotError = (disposal: UnmatchedDisposal): RupeaError =>
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
