import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Terms from '#services/ledger/application/terms.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';

const listAccounts = os.accounts.list
	.use(signedIn)
	.handler(async ({ input: { handle, day } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Accounts.listAccounts({ ledger: l, day }) }),
		),
	);

const listWorth = os.accounts.listWorth
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listWorth({ ledger: l, from, to, account: account ?? null }),
			}),
		),
	);

const listInvested = os.accounts.listInvested
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listInvested({ ledger: l, from, to, account: account ?? null }),
			}),
		),
	);

const findBridge = os.accounts.findBridge
	.use(signedIn)
	.handler(async ({ input: { handle, from, to } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Accounts.findBridge({ ledger: l, from, to }) }),
		),
	);

const listDrops = os.accounts.listDrops
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listDrops({ ledger: l, from, to, account: account ?? null }),
			}),
		),
	);

const listReturns = os.accounts.listReturns
	.use(signedIn)
	.handler(async ({ input: { handle, from, to } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Accounts.listReturns({ ledger: l, from, to }) }),
		),
	);

const listDeltas = os.accounts.listDeltas
	.use(signedIn)
	.handler(async ({ input: { handle, spans, bucket, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listDeltas({ ledger: l, spans, bucket, account }),
			}),
		),
	);

const listDailyDeltas = os.accounts.listDailyDeltas
	.use(signedIn)
	.handler(async ({ input: { handle, from, to, account } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listDailyDeltas({ ledger: l, span: { from, to }, account }),
			}),
		),
	);

const listLots = os.accounts.listLots
	.use(signedIn)
	.handler(async ({ input: { handle, account, commodity } }) =>
		sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Accounts.listLots({ ledger: l, account, commodity }),
			}),
		),
	);

const listAccountTree = os.accounts.listTree
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Accounts.listAccountTree }));

const listAccountNames = os.accounts.listNames
	.use(signedIn)
	.handler(({ input: { handle, prefix } }) =>
		inLedger({ handle, action: (l) => Accounts.listAccountNames({ ledger: l, prefix }) }),
	);

const listTerms = os.accounts.listTerms
	.use(signedIn)
	.handler(({ input: { handle, day } }) =>
		inLedger({ handle, action: (l) => Terms.listTerms({ ledger: l, day: day.toString() }) }),
	);

const saveTerms = os.accounts.saveTerms
	.use(signedIn)
	.handler(({ input: { handle, account, entries } }) =>
		inLedger({ handle, action: (l) => Terms.saveTerms({ ledger: l, account, entries }) }),
	);

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
