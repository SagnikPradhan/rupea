import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { DayOut } from '@rupea/shared/dates.ts';
import { CURRENCIES } from '@rupea/shared/money.ts';
import { Handle } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const listLedgers = oc
	.route({
		method: 'GET',
		path: '/ledgers',
		operationId: 'ledger.list',
		description: dedent`
			Lists the ledgers the caller may open, each with its handle, its name, the
			currency a bare amount is in, and whether the caller owns it.
		`,
	})
	.errors(errors)
	.output(
		v.array(
			v.object({ handle: v.string(), name: v.string(), base: v.string(), owned: v.boolean() }),
		),
	);

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

const listCurrencies = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/currencies',
		operationId: 'ledger.listCurrencies',
		description: dedent`
			Lists the currencies the ledger's prices can value it in, its base among
			them, in order.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(v.string()));

const saveBase = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/base',
		operationId: 'ledger.saveBase',
		description: dedent`
			Writes the currency a bare amount is in atop main.rupea, and reads the
			ledger again in it. Amounts are relabelled, not converted.

			Fails with CannotWriteBase when the base cannot be written. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, base: v.picklist(CURRENCIES) }))
	.errors(errors);

export const ledger = {
	list: listLedgers,
	findFirstDay,
	listProblems,
	findSync,
	resync,
	listCurrencies,
	saveBase,
};
