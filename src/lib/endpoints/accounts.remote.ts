import { replyFromBatch } from '#lib/server/shared/result/reply.ts';
import { Day, Range, startOf } from '#lib/shared/dates.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import { query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger } from './shared';
import { viewAccount, viewLot, viewWorth } from './views';

export const listAccounts = query(v.object({ handle: Handle, day: Day }), ({ handle, day }) =>
	replyFromBatch(
		inLedger({ handle, action: (l) => Accounts.listAccounts({ ledger: l, day }) }).map((b) => ({
			...b,
			succeeded: b.succeeded.map(viewAccount),
		})),
	),
);

export const listWorth = query(
	v.object({ handle: Handle, range: Range, day: Day }),
	({ handle, range, day }) =>
		replyFromBatch(
			inLedger({
				handle,
				action: (l) => Accounts.listWorth({ ledger: l, from: startOf[range](day), to: day }),
			}).map((b) => ({ ...b, succeeded: b.succeeded.map(viewWorth) })),
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
