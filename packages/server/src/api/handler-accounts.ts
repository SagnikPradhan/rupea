import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Terms from '#services/ledger/application/terms.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';

const listAccounts = os.accounts.list
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Accounts.listAccounts }));

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

const listBalances = os.accounts.listBalances
	.use(signedIn)
	.handler(async ({ input: { handle, ...options } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Accounts.listBalances({ ledger: l, ...options }) }),
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
	listBalances,
	findBridge,
	listDrops,
	listReturns,
	listLots,
	listTerms,
	saveTerms,
};
