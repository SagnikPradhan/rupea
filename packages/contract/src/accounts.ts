import { oc } from '@orpc/contract';
import { BalanceAccount, EXPENSES, FlowAccount } from '@rupea/shared/accounts.ts';
import { AmountOut, QuantityOut } from '@rupea/shared/amounts.ts';
import { Bucket, Day, DayOut, Span } from '@rupea/shared/dates.ts';
import { TermsForm, TermsOut } from '@rupea/shared/terms.ts';
import * as v from 'valibot';
import { batchOf, errors } from './errors.ts';

const Handle = v.string();

const Spanned = v.object({ handle: Handle, from: Day, to: Day });

const Location = v.object({ file: v.string(), line: v.number() });

const Holding = v.object({
	commodity: v.string(),
	hasLots: v.boolean(),
	units: AmountOut,
	price: v.nullable(QuantityOut),
	value: v.nullable(AmountOut),
	paid: v.nullable(AmountOut),
	gain: v.nullable(AmountOut),
});

const Account = v.object({
	account: v.string(),
	parent: v.nullable(v.string()),
	holdings: v.array(Holding),
	total: AmountOut,
	cost: v.nullable(AmountOut),
	gain: v.nullable(AmountOut),
	unpriced: v.number(),
});

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

const Flow = {
	amount: AmountOut,
	inflow: AmountOut,
	outflow: AmountOut,
	unpriced: v.number(),
};

const Deltas = v.object({
	from: DayOut,
	to: DayOut,
	bucket: Bucket,
	buckets: v.array(DayOut),
	totals: v.array(v.object({ account: v.string(), parent: v.nullable(v.string()), ...Flow })),
	deltas: v.array(v.object({ account: v.string(), bucket: DayOut, ...Flow })),
});

const Daily = v.object({ day: v.number(), amount: AmountOut, unpriced: v.number() });

const Lot = v.object({
	location: Location,
	date: DayOut,
	origin: v.picklist(['buy', 'transfer', 'short', 'unpriced']),
	from: v.nullable(v.string()),
	units: AmountOut,
	remaining: AmountOut,
	cost: QuantityOut,
	disposals: v.array(
		v.object({
			location: Location,
			date: DayOut,
			kind: v.picklist(['sale', 'transfer', 'gift', 'cover']),
			units: AmountOut,
			price: v.nullable(QuantityOut),
			gain: v.nullable(QuantityOut),
		}),
	),
});

const Held = v.object({
	account: v.string(),
	current: v.record(v.string(), v.string()),
	held: v.nullable(TermsOut),
});

/**
 * What each balance account held at the end of a day, valued at that day's
 * prices.
 */
export const listAccounts = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/accounts', operationId: 'listAccounts' })
	.input(v.object({ handle: Handle, day: Day }))
	.errors(errors)
	.output(batchOf(Account));

/** What the ledger's balance accounts were worth at the end of each day. */
export const listWorth = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/worth', operationId: 'listWorth' })
	.input(v.object({ handle: Handle, from: Day, to: Day, account: v.optional(v.string()) }))
	.errors(errors)
	.output(batchOf(Worth));

/**
 * What the holdings with lots were worth at the end of each day, beside what
 * their lots cost.
 */
export const listInvested = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/invested', operationId: 'listInvested' })
	.input(v.object({ ...Spanned.entries, account: v.optional(BalanceAccount) }))
	.errors(errors)
	.output(batchOf(Invested));

/**
 * Why net worth moved over a span: income, expenses, and what prices did to
 * each group.
 */
export const findBridge = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/bridge', operationId: 'findBridge' })
	.input(Spanned)
	.errors(errors)
	.output(batchOf(Bridge));

/**
 * How far the holdings with lots stood below their high, and how far each
 * account fell.
 */
export const listDrops = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/drops', operationId: 'listDrops' })
	.input(v.object({ ...Spanned.entries, account: v.optional(BalanceAccount) }))
	.errors(errors)
	.output(batchOf(Drops));

/**
 * What flowed into each Assets account over a span less what flowed out, and
 * its XIRR.
 */
export const listReturns = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/returns', operationId: 'listReturns' })
	.input(Spanned)
	.errors(errors)
	.output(batchOf(Returns));

/**
 * What flowed under an account over each span given, bucketed by the day, month
 * or year.
 */
export const listDeltas = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/deltas', operationId: 'listDeltas' })
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

/** What an account averaged on each day of the month over a span. */
export const listDailyDeltas = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/daily-deltas',
		operationId: 'listDailyDeltas',
	})
	.input(v.object({ ...Spanned.entries, account: v.optional(FlowAccount, EXPENSES) }))
	.errors(errors)
	.output(batchOf(Daily));

/** The lots of a commodity in an account, with what was taken out of each. */
export const listLots = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/lots', operationId: 'listLots' })
	.input(v.object({ handle: Handle, account: v.string(), commodity: v.string() }))
	.errors(errors)
	.output(batchOf(Lot));

/** Every account, each with the one it is drawn under. */
export const listAccountTree = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/account-tree',
		operationId: 'listAccountTree',
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(v.object({ account: v.string(), parent: v.nullable(v.string()) })));

/** The names of the accounts that start with a prefix. */
export const listAccountNames = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/account-names',
		operationId: 'listAccountNames',
	})
	.input(v.object({ handle: Handle, prefix: v.string() }))
	.errors(errors)
	.output(v.array(v.string()));

/** What the A lines of a ledger set each account up with on a day. */
export const listTerms = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/terms', operationId: 'listTerms' })
	.input(v.object({ handle: Handle, day: Day }))
	.errors(errors)
	.output(v.array(Held));

/** Writes an account's terms under its A * line, and answers the file it wrote. */
export const saveTerms = oc
	.route({ method: 'PUT', path: '/ledgers/{handle}/terms', operationId: 'saveTerms' })
	.input(v.object({ handle: Handle, ...TermsForm.entries }))
	.errors(errors)
	.output(v.object({ file: v.string() }));
