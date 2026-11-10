import { oc } from '@orpc/contract';
import { DayOut } from '@rupea/shared/dates.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const Handle = v.string();

/** The ledgers the caller may open, and whether they own each. */
export const listLedgers = oc
	.route({ method: 'GET', path: '/ledgers', operationId: 'listLedgers' })
	.errors(errors)
	.output(v.array(v.object({ handle: v.string(), name: v.string(), owned: v.boolean() })));

/** The day of the ledger's first transaction, or none before it has one. */
export const findFirstDay = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/first-day', operationId: 'findFirstDay' })
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.nullable(DayOut));

/** What is wrong across the ledger, as its last sync left it. */
export const listProblems = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/problems', operationId: 'listProblems' })
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(batchOf(v.never()));

/** How the ledger's latest sync went, or none before its first. */
export const findSync = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/sync', operationId: 'findSync' })
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.nullable(v.picklist(['queued', 'running', 'succeeded', 'failed'])));

/**
 * Queues a sync that reads every file again and rebuilds what is worked out
 * from them.
 */
export const resync = oc
	.route({ method: 'POST', path: '/ledgers/{handle}/sync', operationId: 'resync' })
	.input(v.object({ handle: Handle }))
	.errors(errors);
