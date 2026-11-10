import { oc } from '@orpc/contract';
import { AmountOut } from '@rupea/shared/amounts.ts';
import { Day, DayOut } from '@rupea/shared/dates.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const Worth = v.object({
	day: DayOut,
	assets: AmountOut,
	liabilities: AmountOut,
	worth: AmountOut,
	unpriced: v.number(),
});

/** What the ledger's balance accounts were worth at the end of each day. */
export const listWorth = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/worth', operationId: 'listWorth' })
	.input(v.object({ handle: v.string(), from: Day, to: Day, account: v.optional(v.string()) }))
	.errors(errors)
	.output(batchOf(Worth));
