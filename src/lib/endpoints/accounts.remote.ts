import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { Day, Period, spansOf } from '#lib/shared/dates.ts';
import { BalanceAccount, FlowAccount } from '#lib/shared/accounts.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Terms from '#services/ledger/application/terms.ts';
import { TermsForm } from '#lib/shared/terms.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { listProblems } from './ledger.remote';
import { Handle, inLedger } from './shared';
import {
	viewAccount,
	viewBridge,
	viewDaily,
	viewDrops,
	viewInvested,
	viewLot,
	viewReturns,
	viewDeltas,
	viewWorth,
} from './views';

/**
 * What each balance account held at the end of a period, valued at that day's
 * prices.
 */
export const listAccounts = query(
	v.object({ handle: Handle, day: Day, period: Period }),
	({ handle, day, period }) => {
		const end = spansOf(period, day).current.to;

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listAccounts({ ledger: l, day: end }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewAccount) })),
		);
	},
);

/** Net worth at the end of each day of a period. */
export const listWorth = query(
	v.object({ handle: Handle, day: Day, period: Period, account: BalanceAccount }),
	({ handle, day, period, account }) => {
		const { from, to } = spansOf(period, day).current;

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listWorth({ ledger: l, from, to, account }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewWorth) })),
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
		const { from, to } = spansOf(period, day).current;

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listInvested({ ledger: l, from, to, account }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewInvested) })),
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
		const { from, to } = spansOf(period, day).current;

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.findBridge({ ledger: l, from, to }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewBridge) })),
		);
	},
);

/**
 * How far the holdings with lots stood below their high at the end of each day
 * of a period, and how far each account fell at its lowest.
 */
export const listDrops = query(
	v.object({ handle: Handle, day: Day, period: Period, account: BalanceAccount }),
	({ handle, day, period, account }) => {
		const { from, to } = spansOf(period, day).current;

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listDrops({ ledger: l, from, to, account }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewDrops) })),
		);
	},
);

/**
 * What flowed into each Assets account over a period less what flowed out, and
 * its XIRR.
 */
export const listReturns = query(
	v.object({ handle: Handle, day: Day, period: Period }),
	({ handle, day, period }) => {
		const { from, to } = spansOf(period, day).current;

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listReturns({ ledger: l, from, to }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewReturns) })),
		);
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
		const spans = previous ? [current, previous] : [current];

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listDeltas({ ledger: l, spans, bucket, account }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewDeltas) })),
		);
	},
);

/**
 * What an Expenses, Income or Liabilities account averaged on each day of the
 * month over a period.
 */
export const listDailyDeltas = query(
	v.object({ handle: Handle, day: Day, period: Period, account: FlowAccount }),
	({ handle, day, period, account }) =>
		replyFromBatch(
			inLedger({
				handle,
				action: (l) =>
					Accounts.listDailyDeltas({ ledger: l, span: spansOf(period, day).current, account }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewDaily) })),
		),
);

export const listLots = query(
	v.object({ handle: Handle, account: v.string(), commodity: v.string() }),
	({ handle, account, commodity }) =>
		replyFromBatch(
			inLedger({ handle, action: (l) => Accounts.listLots({ ledger: l, account, commodity }) }).map(
				(b) => ({ ...b, succeeded: b.succeeded.map(viewLot) }),
			),
		),
);

export const listAccountTree = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Accounts.listAccountTree })),
);

export const listAccountNames = query(
	v.object({ handle: Handle, prefix: v.string() }),
	({ handle, prefix }) =>
		replyFrom(
			inLedger({ handle, action: (l) => Accounts.listAccountNames({ ledger: l, prefix }) }),
		),
);

/** What the A lines of a ledger set each account up with on a day. */
export const listTerms = query(v.object({ handle: Handle, day: Day }), ({ handle, day }) =>
	replyFrom(
		inLedger({ handle, action: (l) => Terms.listTerms({ ledger: l, day: day.toString() }) }),
	),
);

/** Sets up an account by writing its terms under an A * line. */
export const saveTerms = command(
	v.object({ handle: Handle, form: TermsForm }),
	async ({ handle, form }) => {
		const saved = await inLedger({
			handle,
			action: (l) => Terms.saveTerms({ ledger: l, ...form }),
		});
		void listProblems(handle).refresh();
		return replyFrom(saved);
	},
);
