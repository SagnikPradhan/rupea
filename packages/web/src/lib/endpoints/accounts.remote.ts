import { replyFromBatchCall, replyFromCall } from './reply';
import { Day, Period, type Span, spansOf } from '@rupea/shared/dates.ts';
import { BalanceAccount, FlowAccount } from '@rupea/shared/accounts.ts';
import { TermsForm } from '@rupea/shared/terms.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { api } from './api';
import { listProblems } from './ledger.remote';
import { Handle } from '@rupea/shared/handle.ts';
import { viewAccount, viewDeltas, viewLot } from './views';

const writtenSpan = ({ from, to }: Span) => ({ from: from.toString(), to: to.toString() });

/**
 * What each balance account held at the end of a period, valued at that day's
 * prices.
 */
export const listAccounts = query(
	v.object({ handle: Handle, day: Day, period: Period }),
	({ handle, day, period }) =>
		replyFromBatchCall(
			api()
				.accounts.list({ handle, day: spansOf(period, day).current.to.toString() })
				.then((b) => ({ ...b, succeeded: b.succeeded.map(viewAccount) })),
		),
);

/** Net worth at the end of each day of a period. */
export const listWorth = query(
	v.object({ handle: Handle, day: Day, period: Period, account: BalanceAccount }),
	({ handle, day, period, account }) => {
		const { from, to } = writtenSpan(spansOf(period, day).current);

		return replyFromBatchCall(
			api().accounts.listWorth({ handle, from, to, account: account ?? undefined }),
		);
	},
);

/**
 * What the holdings with lots were worth at the end of each day of a period,
 * beside what their lots had cost.
 */
export const listInvested = query(
	v.object({ handle: Handle, day: Day, period: Period, account: BalanceAccount }),
	({ handle, day, period, account }) => {
		const { from, to } = writtenSpan(spansOf(period, day).current);

		return replyFromBatchCall(api().accounts.listInvested({ handle, from, to, account }));
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
 * then over the one before it when there is one.
 */
export const listDeltas = query(
	v.object({ handle: Handle, day: Day, period: Period, account: FlowAccount }),
	({ handle, day, period, account }) => {
		const { current, previous, bucket } = spansOf(period, day);
		const spans = (previous ? [current, previous] : [current]).map(writtenSpan);

		return replyFromBatchCall(
			api()
				.accounts.listDeltas({ handle, spans, bucket, account })
				.then((b) => ({ ...b, succeeded: b.succeeded.map(viewDeltas) })),
		);
	},
);

/**
 * What an Expenses, Income or Liabilities account averaged on each day of the
 * month over a period.
 */
export const listDailyDeltas = query(
	v.object({ handle: Handle, day: Day, period: Period, account: FlowAccount }),
	({ handle, day, period, account }) => {
		const { from, to } = writtenSpan(spansOf(period, day).current);

		return replyFromBatchCall(api().accounts.listDailyDeltas({ handle, from, to, account }));
	},
);

export const listLots = query(
	v.object({ handle: Handle, account: v.string(), commodity: v.string() }),
	({ handle, account, commodity }) =>
		replyFromBatchCall(
			api()
				.accounts.listLots({ handle, account, commodity })
				.then((b) => ({ ...b, succeeded: b.succeeded.map(viewLot) })),
		),
);

export const listAccountTree = query(Handle, (h) =>
	replyFromCall(api().accounts.listTree({ handle: h })),
);

export const listAccountNames = query(
	v.object({ handle: Handle, prefix: v.string() }),
	({ handle, prefix }) => replyFromCall(api().accounts.listNames({ handle, prefix })),
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
