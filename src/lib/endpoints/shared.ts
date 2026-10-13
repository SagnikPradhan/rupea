import { isHandle } from '#lib/server/shared/names.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as v from 'valibot';

export const Handle = v.pipe(v.string(), v.check(isHandle, 'Not a ledger handle.'));

export const Key = v.pipe(
	v.string(),
	v.nonEmpty(),
	v.endsWith('.rupee', 'Ledger files end in .rupee.'),
);

export const SchemaKey = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty(),
	v.endsWith('.yml', 'Schemas end in .yml.'),
);

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
