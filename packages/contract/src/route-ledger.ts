import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { DayOut } from '@rupea/shared/dates.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const listLedgers = oc
	.route({
		method: 'GET',
		path: '/ledgers',
		operationId: 'ledger.list',
		description: dedent`
			Lists the ledgers the caller may open, each with its handle and name, and
			whether the caller owns it.
		`,
	})
	.errors(errors)
	.output(v.array(v.object({ handle: v.string(), name: v.string(), owned: v.boolean() })));

const findFirstDay = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/first-day',
		operationId: 'ledger.findFirstDay',
		description: dedent`
			Answers the day of the ledger's first transaction, or null before it has
			one.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.nullable(DayOut));

const listProblems = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/problems',
		operationId: 'ledger.listProblems',
		description: dedent`
			Lists what is wrong across the ledger, as its last sync left it, such as a
			line that does not parse.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(batchOf(v.never()));

const findSync = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/sync',
		operationId: 'ledger.findSync',
		description: dedent`
			Answers how the ledger's latest sync went (queued, running, succeeded or
			failed), or null before its first.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.nullable(v.picklist(['queued', 'running', 'succeeded', 'failed'])));

const resync = oc
	.route({
		method: 'POST',
		path: '/ledgers/{handle}/sync',
		operationId: 'ledger.resync',
		description: dedent`
			Queues a sync that reads every file again and rebuilds what is worked out
			from them.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors);

export const ledger = {
	list: listLedgers,
	findFirstDay,
	listProblems,
	findSync,
	resync,
};
