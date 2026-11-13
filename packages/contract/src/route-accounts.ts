import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { BalanceAccount, EXPENSES, FlowAccount } from '@rupea/shared/accounts.ts';
import { Bucket, Day, Span } from '@rupea/shared/dates.ts';
import { TermsForm } from '@rupea/shared/terms.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';
import {
	Account,
	Bridge,
	Daily,
	Deltas,
	Drops,
	Held,
	Invested,
	Lot,
	Returns,
	Spanned,
	Worth,
} from './shape-ledger.ts';

const listAccounts = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/accounts',
		operationId: 'accounts.list',
		description: dedent`
			Lists what each balance account held at the end of a day, valued at that
			day's prices.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, day: Day }))
	.errors(errors)
	.output(batchOf(Account));

const listWorth = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/worth',
		operationId: 'accounts.listWorth',
		description: dedent`
			Lists what the ledger's balance accounts were worth at the end of each day
			from from to to, in total and by account. A holding with no price yet is
			left out and counted as unpriced.

			Fails with LedgerNotFound when the caller cannot open the ledger. A span
			that runs backwards fails with SpanReversed, and one that covers too many
			days with SpanTooLong.
		`,
	})
	.input(v.object({ handle: Handle, from: Day, to: Day, account: v.optional(v.string()) }))
	.errors(errors)
	.output(batchOf(Worth));

const listInvested = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/invested',
		operationId: 'accounts.listInvested',
		description: dedent`
			Lists what the holdings with lots were worth at the end of each day,
			beside what their lots cost.

			Fails with LedgerNotFound when the caller cannot open the ledger. A span
			that runs backwards fails with SpanReversed, and one that covers too many
			days with SpanTooLong.
		`,
	})
	.input(v.object({ ...Spanned.entries, account: v.optional(BalanceAccount) }))
	.errors(errors)
	.output(batchOf(Invested));

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

const listDeltas = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/deltas',
		operationId: 'accounts.listDeltas',
		description: dedent`
			Lists what flowed under an account over each span given, one or two,
			bucketed by the day, month or year. The account defaults to Expenses.

			Fails with LedgerNotFound when the caller cannot open the ledger. A span
			that runs backwards fails with SpanReversed, and one that covers too many
			days with SpanTooLong.
		`,
	})
	.input(
		v.object({
			handle: Handle,
			spans: v.pipe(v.array(Span), v.minLength(1), v.maxLength(2)),
			bucket: Bucket,
			account: v.optional(FlowAccount, EXPENSES),
		}),
	)
	.errors(errors)
	.output(batchOf(Deltas));

const listDailyDeltas = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/daily-deltas',
		operationId: 'accounts.listDailyDeltas',
		description: dedent`
			Lists what an account averaged on each day of the month over a span. The
			account defaults to Expenses.

			Fails with LedgerNotFound when the caller cannot open the ledger. A span
			that runs backwards fails with SpanReversed, and one that covers too many
			days with SpanTooLong.
		`,
	})
	.input(v.object({ ...Spanned.entries, account: v.optional(FlowAccount, EXPENSES) }))
	.errors(errors)
	.output(batchOf(Daily));

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

const listAccountTree = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/account-tree',
		operationId: 'accounts.listTree',
		description: dedent`
			Lists every account with the one it is drawn under.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(v.object({ account: v.string(), parent: v.nullable(v.string()) })));

const listAccountNames = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/account-names',
		operationId: 'accounts.listNames',
		description: dedent`
			Lists the names of the accounts that start with the prefix, for an editor
			to complete from.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, prefix: v.string() }))
	.errors(errors)
	.output(v.array(v.string()));

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
	listWorth,
	listInvested,
	findBridge,
	listDrops,
	listReturns,
	listDeltas,
	listDailyDeltas,
	listLots,
	listTree: listAccountTree,
	listNames: listAccountNames,
	listTerms,
	saveTerms,
};
