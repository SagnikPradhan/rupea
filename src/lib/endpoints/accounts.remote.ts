import { replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { Day, Period, spansOf } from '#lib/shared/dates.ts';
import { BalanceAccount, ExpenseAccount } from '#lib/shared/accounts.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import { query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger } from './shared';
import { viewAccount, viewLot, viewReturns, viewSpending, viewWorth } from './views';

/** What each balance account held at the end of a period, valued at that day's prices. */
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

/** What flowed into each Assets account over a period less what flowed out, and its XIRR. */
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

/** Spending under an account over a period, then over the one before it when there is one. */
export const listSpending = query(
	v.object({ handle: Handle, day: Day, period: Period, account: ExpenseAccount }),
	({ handle, day, period, account }) => {
		const { current, previous, bucket } = spansOf(period, day);
		const spans = previous ? [current, previous] : [current];

		return replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listSpending({ ledger: l, spans, bucket, account }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewSpending) })),
		);
	},
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
