import { isHandle } from '@rupea/server/shared/names.ts';
import type { ResultAsync } from '@rupea/server/shared/result/result.ts';
import * as Auth from '@rupea/server/services/auth/application/auth.ts';
import * as Ledger from '@rupea/server/services/ledger/application/ledger.ts';
import * as v from 'valibot';

export const Handle = v.pipe(v.string(), v.check(isHandle, 'Not a ledger handle.'));

type InLedgerOptions<T> = {
	handle: string;
	action: (ledger: Ledger.Ledger, user: Auth.User) => ResultAsync<T>;
};

/** The ledger a page is on, if the signed-in user may reach it. */
export const inLedger = <T>(options: InLedgerOptions<T>): ResultAsync<T> =>
	Auth.withCurrentUser((u) =>
		Ledger.withLedger({
			user: u.id,
			handle: options.handle,
			action: (l) => options.action(l, u),
		}),
	);
