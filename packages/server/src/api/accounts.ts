import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { answer } from './answer.ts';
import { sanitise } from './sanitise.ts';
import { os, signedIn } from './session.ts';

export const listWorth = os.listWorth.use(signedIn).handler(async ({ input }) => {
	const { handle, from, to, account } = input;

	const worth = await answer(
		Auth.withCurrentUser((user) =>
			Ledger.withLedger({
				user: user.id,
				handle,
				action: (l) => Accounts.listWorth({ ledger: l, from, to, account: account ?? null }),
			}),
		),
	);

	return { ...worth, failed: worth.failed.map(sanitise) };
});
