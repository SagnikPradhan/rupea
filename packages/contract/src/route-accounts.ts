import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { BalanceAccount } from '@rupea/shared/money.ts';
import { Accumulate, Aggregate, Bucket, isReadable, Measure } from '@rupea/shared/balances.ts';
import { Day } from '@rupea/shared/dates.ts';
import { TermsForm } from '@rupea/shared/forms.ts';
import { Handle } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';
import {
	AccountRow,
	Balances,
	Bridge,
	Drops,
	Held,
	Lot,
	Returns,
	Spanned,
} from './shape-ledger.ts';

const listAccounts = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/accounts',
		operationId: 'accounts.list',
		description: dedent`
			Lists every account of the ledger, each with the one above it and whether
			anything is posted to it.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(AccountRow));

const findBridge = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/bridge',
		operationId: 'accounts.findBridge',
		description: dedent`
			Answers why net worth moved from from to to: the income and expenses, and
			what prices did to each group of accounts.

			Fails with LedgerNotFound when the caller cannot open the ledger. A span
			that runs backwards fails with SpanReversed, and one that covers too many
			days with SpanTooLong.
		`,
	})
	.input(Spanned)
	.errors(errors)
	.output(batchOf(Bridge));

const listDrops = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/drops',
		operationId: 'accounts.listDrops',
		description: dedent`
			Lists how far the holdings with lots stood below their high, and how far
			each account fell.

			Fails with LedgerNotFound when the caller cannot open the ledger. A span
			that runs backwards fails with SpanReversed, and one that covers too many
			days with SpanTooLong.
		`,
	})
	.input(v.object({ ...Spanned.entries, account: v.optional(BalanceAccount) }))
	.errors(errors)
	.output(batchOf(Drops));

const listReturns = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/returns',
		operationId: 'accounts.listReturns',
		description: dedent`
			Lists what flowed into each Assets account over the span less what flowed
			out, with its XIRR. An account whose return cannot be worked out is
			reported as failed.

			Fails with LedgerNotFound when the caller cannot open the ledger. A span
			that runs backwards fails with SpanReversed, and one that covers too many
			days with SpanTooLong.
		`,
	})
	.input(Spanned)
	.errors(errors)
	.output(batchOf(Returns));

const listBalances = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/balances',
		operationId: 'accounts.listBalances',
		description: dedent`
			Lists what an account and those under it came to over a span, by account
			and bucket, with the measures asked for: the net, what came in and what
			went out. Without an account, every account of the ledger. A bucket the
			span comes to more than once is summed or averaged.

			Fails with LedgerNotFound when the caller cannot open the ledger, and with
			AccountNotFound when the account is not in it. A request that cannot be
			read fails with InvalidRequest. A span that runs backwards fails with
			SpanReversed, and one that covers too many days with SpanTooLong.
		`,
	})
	.input(
		v.pipe(
			v.object({
				...Spanned.entries,
				account: v.optional(v.string()),
				bucket: Bucket,
				accumulate: v.optional(Accumulate, 'change'),
				aggregate: v.optional(Aggregate, 'sum'),
				measures: v.optional(v.pipe(v.array(Measure), v.minLength(1)), ['value']),
			}),
			v.check(
				(i) => isReadable(i),
				'A historical balance needs a bucket that ends and has no inflow or outflow; units, cost and price are historical only.',
			),
		),
	)
	.errors(errors)
	.output(batchOf(Balances));

const listLots = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/lots',
		operationId: 'accounts.listLots',
		description: dedent`
			Lists the lots of a commodity in an account, with what was taken out of
			each.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, account: v.string(), commodity: v.string() }))
	.errors(errors)
	.output(batchOf(Lot));

const listTerms = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/terms',
		operationId: 'accounts.listTerms',
		description: dedent`
			Lists what the A lines of the ledger set each account up with on a day.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, day: Day }))
	.errors(errors)
	.output(v.array(Held));

const saveTerms = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/terms',
		operationId: 'accounts.saveTerms',
		description: dedent`
			Writes an account's terms under its A * line and answers the file it
			wrote.

			Fails with CannotWriteTerms when the terms cannot be written. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, ...TermsForm.entries }))
	.errors(errors)
	.output(v.object({ file: v.string() }));

export const accounts = {
	list: listAccounts,
	listBalances,
	findBridge,
	listDrops,
	listReturns,
	listLots,
	listTerms,
	saveTerms,
};
