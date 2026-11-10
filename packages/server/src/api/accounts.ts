import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Terms from '#services/ledger/application/terms.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';

export const listAccounts = os.listAccounts
	.use(signedIn)
	.handler(async ({ input: { handle, day } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Accounts.listAccounts({ ledger: l, day }) }),
		),
	);

export const listWorth = os.listWorth
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listWorth({ ledger: l, from, to, account: account ?? null }),
			}),
		),
	);

export const listInvested = os.listInvested
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listInvested({ ledger: l, from, to, account: account ?? null }),
			}),
		),
	);

export const findBridge = os.findBridge
	.use(signedIn)
	.handler(async ({ input: { handle, from, to } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Accounts.findBridge({ ledger: l, from, to }) }),
		),
	);

export const listDrops = os.listDrops
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listDrops({ ledger: l, from, to, account: account ?? null }),
			}),
		),
	);

export const listReturns = os.listReturns
	.use(signedIn)
	.handler(async ({ input: { handle, from, to } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Accounts.listReturns({ ledger: l, from, to }) }),
		),
	);

export const listDeltas = os.listDeltas
	.use(signedIn)
	.handler(async ({ input: { handle, spans, bucket, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listDeltas({ ledger: l, spans, bucket, account }),
			}),
		),
	);

export const listDailyDeltas = os.listDailyDeltas
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listDailyDeltas({ ledger: l, span: { from, to }, account }),
			}),
		),
	);

export const listLots = os.listLots
	.use(signedIn)
	.handler(async ({ input: { handle, account, commodity } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listLots({ ledger: l, account, commodity }),
			}),
		),
	);

export const listAccountTree = os.listAccountTree
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Accounts.listAccountTree }));

export const listAccountNames = os.listAccountNames
	.use(signedIn)
	.handler(({ input: { handle, prefix } }) =>
		inLedger({ handle, action: (l) => Accounts.listAccountNames({ ledger: l, prefix }) }),
	);

export const listTerms = os.listTerms
	.use(signedIn)
	.handler(({ input: { handle, day } }) =>
		inLedger({ handle, action: (l) => Terms.listTerms({ ledger: l, day: day.toString() }) }),
	);

export const saveTerms = os.saveTerms
	.use(signedIn)
	.handler(({ input: { handle, account, entries } }) =>
		inLedger({ handle, action: (l) => Terms.saveTerms({ ledger: l, account, entries }) }),
	);
