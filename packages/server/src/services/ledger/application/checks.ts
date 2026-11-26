import { fault, type RupeaError } from '@rupea/shared/errors.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { printQuantity, type Amount } from '../domain/amounts';
import type { UnmatchedDisposal } from '../domain/lots';
import { displayLocation } from '../domain/parser';
import { DisposalKind, type Ledger } from '../domain/types';

type LotsScope = { accounts: string[]; to: Temporal.PlainDate };

/**
 * Disposals no lot covers, in the scope's accounts up to its day, or in the
 * whole ledger.
 */
export const checkLots = (l: Ledger, s?: LotsScope): ResultAsync<RupeaError[]> =>
	DB.listUnmatched(l.id, s).map((u) => u.map(toLotError));

const toLotError = (disposal: UnmatchedDisposal): RupeaError =>
	disposal.kind === DisposalKind.Sale && !disposal.named
		? fault('LotCostMissing', {
				location: displayLocation(disposal.location),
				account: disposal.account,
			})
		: fault('LotNotOpen', {
				location: displayLocation(disposal.location),
				account: disposal.account,
				units: printQuantity({ amount: -disposal.units as Amount, commodity: disposal.commodity }),
			});
