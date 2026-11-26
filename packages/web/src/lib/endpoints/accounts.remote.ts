import { replyFromBatchCall, replyFromCall } from './reply';
import { bucketFor, closingBucketOf, spanFrom } from '@rupea/shared/balances.ts';
import { Day, Period, type Span, spansOf } from '@rupea/shared/dates.ts';
import { ASSETS, BalanceAccount, FlowAccount } from '@rupea/shared/money.ts';
import { BudgetForm, TermsForm } from '@rupea/shared/forms.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { api, findBase } from './api';
import { listProblems } from './ledger.remote';
import { parentsIn } from '@rupea/shared/account-tree.ts';
import { Handle } from '@rupea/shared/text.ts';
import {
	viewDaily,
	viewDeltas,
	viewHoldings,
	investedFrom,
	viewBudget,
	viewLot,
	worthFrom,
} from './views';

const writtenSpan = ({ from, to }: Span) => ({ from: from.toString(), to: to.toString() });

/**
 * The bucket a historical read draws, counting the span from the ledger's first
 * day.
 */
const closingBucketIn = async (handle: string, { from, to }: Span) => {
	const first = await api().ledger.findFirstDay({ handle });

	return closingBucketOf(spanFrom({ from, to }, first));
};

/**
 * Every account of the ledger, each with the one above it and whether anything
 * is posted to it.
 */
export const listAccounts = query(Handle, (h) => replyFromCall(api().accounts.list({ handle: h })));

/**
 * What each balance account held at the end of a period, valued at that day's
 * prices.
 */
export const listHoldings = query(
	v.object({ handle: Handle, day: Day, period: Period }),
	({ handle, day, period }) => {
		const on = spansOf(period, day).current.to.toString();

		return replyFromBatchCall(
			Promise.all([
				api().accounts.listBalances({
					handle,
					from: on,
					to: on,
					bucket: 'date',
					measures: ['value', 'units', 'price', 'cost'],
				}),
				api().accounts.list({ handle }),
				findBase(handle),
			]).then(([b, accounts, base]) => ({
				succeeded: b.succeeded.flatMap((d) =>
					viewHoldings(d, { parents: parentsIn(accounts), base }),
				),
				failed: b.failed,
			})),
		);
	},
);

/** Net worth at the end of each day of a period. */
export const listWorth = query(
	v.object({ handle: Handle, day: Day, period: Period, account: BalanceAccount }),
	async ({ handle, day, period, account }) => {
		const span = spansOf(period, day).current;

		return replyFromBatchCall(
			Promise.all([
				api().accounts.listBalances({
					...writtenSpan(span),
					handle,
					account: account ?? undefined,
					bucket: await closingBucketIn(handle, span),
					measures: account === null ? ['value'] : ['value', 'units'],
				}),
				api().accounts.list({ handle }),
				findBase(handle),
			]).then(([b, accounts, base]) => ({
				succeeded: b.succeeded.flatMap((d) => worthFrom(d, { tree: accounts, account, base })),
				failed: b.failed,
			})),
		);
	},
);

/**
 * What the holdings with lots were worth at the end of each day of a period,
 * beside what their lots had cost.
 */
export const listInvested = query(
	v.object({ handle: Handle, day: Day, period: Period, account: BalanceAccount }),
	async ({ handle, day, period, account }) => {
		const span = spansOf(period, day).current;

		return replyFromBatchCall(
			api()
				.accounts.listBalances({
					...writtenSpan(span),
					handle,
					account: account ?? ASSETS,
					bucket: await closingBucketIn(handle, span),
					measures: ['value', 'paid', 'units'],
				})
				.then((b) => ({ ...b, succeeded: b.succeeded.flatMap(investedFrom) })),
		);
	},
);

/**
 * Why net worth moved over a period: the income and expenses, and what prices
 * did to each group.
 */
export const findBridge = query(
	v.object({ handle: Handle, day: Day, period: Period }),
	({ handle, day, period }) => {
		const { from, to } = writtenSpan(spansOf(period, day).current);

		return replyFromBatchCall(api().accounts.findBridge({ handle, from, to }));
	},
);

/**
 * How far the holdings with lots stood below their high at the end of each day
 * of a period, and how far each account fell at its lowest.
 */
export const listDrops = query(
	v.object({ handle: Handle, day: Day, period: Period, account: BalanceAccount }),
	({ handle, day, period, account }) => {
		const { from, to } = writtenSpan(spansOf(period, day).current);

		return replyFromBatchCall(api().accounts.listDrops({ handle, from, to, account }));
	},
);

/**
 * What flowed into each Assets account over a period less what flowed out, and
 * its XIRR.
 */
export const listReturns = query(
	v.object({ handle: Handle, day: Day, period: Period }),
	({ handle, day, period }) => {
		const { from, to } = writtenSpan(spansOf(period, day).current);

		return replyFromBatchCall(api().accounts.listReturns({ handle, from, to }));
	},
);

/**
 * What flowed under an Expenses, Income or Liabilities account over a period,
 * then over the one before it when there is one, unless before is false.
 */
export const listDeltas = query(
	v.object({
		handle: Handle,
		day: Day,
		period: Period,
		account: FlowAccount,
		before: v.optional(v.boolean(), true),
	}),
	({ handle, day, period, account, before }) => {
		const { current, previous, bucket } = spansOf(period, day);
		const spans = (previous && before ? [current, previous] : [current]).map(writtenSpan);

		return replyFromBatchCall(
			Promise.all([
				Promise.all(
					spans.map((s) =>
						api().accounts.listDeltas({
							handle,
							...s,
							account,
							bucket: bucketFor[bucket],
							measures: ['value', 'inflow', 'outflow'],
						}),
					),
				),
				api().accounts.list({ handle }),
			]).then(([batches, accounts]) => ({
				succeeded: batches
					.flatMap((b) => b.succeeded)
					.map((d) => viewDeltas(d, { bucket, parents: parentsIn(accounts) })),
				failed: batches.flatMap((b) => b.failed),
			})),
		);
	},
);

/**
 * What an Expenses, Income or Liabilities account moved on each day of a
 * period, the last year of it when longer.
 */
export const listDailyDeltas = query(
	v.object({ handle: Handle, day: Day, period: Period, account: FlowAccount }),
	({ handle, day, period, account }) => {
		const { from, to } = spansOf(period, day).current;
		const yearStart = to.subtract({ years: 1 }).add({ days: 1 });
		const span = { from: Temporal.PlainDate.compare(from, yearStart) < 0 ? yearStart : from, to };

		return replyFromBatchCall(
			api()
				.accounts.listDeltas({ handle, ...writtenSpan(span), account, bucket: bucketFor.day })
				.then((b) => ({
					...b,
					succeeded: viewDaily({ deltas: b.succeeded[0], account, span }),
				})),
		);
	},
);

export const listLots = query(
	v.object({ handle: Handle, account: v.string(), commodity: v.string() }),
	({ handle, account, commodity }) =>
		replyFromBatchCall(
			Promise.all([api().accounts.listLots({ handle, account, commodity }), findBase(handle)]).then(
				([b, base]) => ({ ...b, succeeded: b.succeeded.map((l) => viewLot(l, base)) }),
			),
		),
);

/** What the A lines of a ledger set each account up with on a day. */
export const listTerms = query(v.object({ handle: Handle, day: Day }), ({ handle, day }) =>
	replyFromCall(api().accounts.listTerms({ handle, day: day.toString() })),
);

/** Sets up an account by writing its terms under an A * line. */
export const saveTerms = command(
	v.object({ handle: Handle, form: TermsForm }),
	async ({ handle, form }) => {
		const saved = await replyFromCall(api().accounts.saveTerms({ handle, ...form }));
		void listProblems(handle).refresh();
		return saved;
	},
);

/**
 * Each account's budget over the days between the start and day, with what was
 * spent and what is left; the start is the day itself when left out.
 */
export const listBudgets = query(
	v.object({ handle: Handle, from: v.optional(Day), day: Day }),
	({ handle, from, day }) =>
		replyFromBatchCall(
			api()
				.accounts.listBudgets({ handle, from: from?.toString(), day: day.toString() })
				.then((b) => ({ ...b, succeeded: b.succeeded.map(viewBudget) })),
		),
);

/** Sets a budget by writing its limit under a B line of the account. */
export const saveBudget = command(
	v.object({ handle: Handle, from: Day, day: Day, form: BudgetForm }),
	async ({ handle, from, day, form }) => {
		const saved = await replyFromCall(api().accounts.saveBudget({ handle, ...form }));
		void listProblems(handle).refresh();
		void listBudgets({ handle, from: from.toString(), day: day.toString() }).refresh();
		return saved;
	},
);
