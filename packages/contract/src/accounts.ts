import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { BalanceAccount, EXPENSES, FlowAccount } from '@rupea/shared/accounts.ts';
import { AmountOut } from '@rupea/shared/amounts.ts';
import { Bucket, Day, DayOut, Span } from '@rupea/shared/dates.ts';
import { TermsForm, TermsOut } from '@rupea/shared/terms.ts';
import { Handle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';
import { Account, Deltas, Lot } from './outputs.ts';

const Spanned = v.object({ handle: Handle, from: Day, to: Day });

const Worth = v.object({
	day: DayOut,
	assets: AmountOut,
	liabilities: AmountOut,
	worth: AmountOut,
	parts: v.array(
		v.object({ account: v.string(), commodity: v.nullable(v.string()), amount: AmountOut }),
	),
	unpriced: v.number(),
});

const Invested = v.object({ day: DayOut, value: AmountOut, cost: AmountOut });

const Drops = v.object({
	underwater: v.array(v.object({ day: DayOut, depth: v.number() })),
	lows: v.array(v.object({ account: v.string(), depth: v.number(), day: DayOut })),
	swings: v.array(v.object({ account: v.string(), swing: v.number() })),
});

const Bridge = v.object({
	from: DayOut,
	to: DayOut,
	start: AmountOut,
	income: AmountOut,
	expenses: AmountOut,
	shifts: v.array(v.object({ account: v.string(), amount: AmountOut })),
	other: AmountOut,
	end: AmountOut,
});

const Returns = v.object({
	account: v.string(),
	netIn: AmountOut,
	xirr: v.nullable(v.number()),
	yearly: v.boolean(),
});

const Daily = v.object({ day: v.number(), amount: AmountOut, unpriced: v.number() });

const Held = v.object({
	account: v.string(),
	current: v.record(v.string(), v.string()),
	held: v.nullable(TermsOut),
});

export const listAccounts = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/accounts',
		operationId: 'listAccounts',
		description: dedent`
			Lists what each balance account held at the end of a day, valued at that
			day's prices.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, day: Day }))
	.errors(errors)
	.output(batchOf(Account));

export const listWorth = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/worth',
		operationId: 'listWorth',
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

export const listInvested = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/invested',
		operationId: 'listInvested',
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

export const findBridge = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/bridge',
		operationId: 'findBridge',
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

export const listDrops = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/drops',
		operationId: 'listDrops',
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

export const listReturns = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/returns',
		operationId: 'listReturns',
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

export const listDeltas = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/deltas',
		operationId: 'listDeltas',
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

export const listDailyDeltas = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/daily-deltas',
		operationId: 'listDailyDeltas',
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

export const listLots = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/lots',
		operationId: 'listLots',
		description: dedent`
			Lists the lots of a commodity in an account, with what was taken out of
			each.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, account: v.string(), commodity: v.string() }))
	.errors(errors)
	.output(batchOf(Lot));

export const listAccountTree = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/account-tree',
		operationId: 'listAccountTree',
		description: dedent`
			Lists every account with the one it is drawn under.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(v.object({ account: v.string(), parent: v.nullable(v.string()) })));

export const listAccountNames = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/account-names',
		operationId: 'listAccountNames',
		description: dedent`
			Lists the names of the accounts that start with the prefix, for an editor
			to complete from.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, prefix: v.string() }))
	.errors(errors)
	.output(v.array(v.string()));

export const listTerms = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/terms',
		operationId: 'listTerms',
		description: dedent`
			Lists what the A lines of the ledger set each account up with on a day.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, day: Day }))
	.errors(errors)
	.output(v.array(Held));

export const saveTerms = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/terms',
		operationId: 'saveTerms',
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
