import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { PRICE_SIGN } from '#services/ledger/domain/printer.ts';
import {
	AccountType,
	accountType,
	formatQuantity,
	type RupeeTransaction,
} from '#services/ledger/domain/types.ts';
import { isHandle } from '#lib/server/shared/names.ts';
import type { ResultAsync } from '#lib/server/shared/result.ts';
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

export const Account = v.pipe(
	v.string(),
	v.trim(),
	v.regex(/^\S+$/, 'An account is one word, like Assets:Bank.'),
	v.check(
		(a) => accountType(a) !== null,
		`An account starts with one of ${Object.values(AccountType).join(', ')}.`,
	),
);

type InLedgerOptions<T> = {
	handle: string;
	action: (ledger: Ledger.Ledger, user: Auth.User) => ResultAsync<T>;
};

// The ledger a page is on, if the signed-in user may reach it.
export const inLedger = <T>(options: InLedgerOptions<T>): ResultAsync<T> =>
	Auth.withCurrentUser((u) =>
		Ledger.withLedger({
			user: u.id,
			handle: options.handle,
			action: (l) => options.action(l, u),
		}),
	);

export const viewTransaction = ({
	location,
	date,
	time,
	description,
	postings,
}: RupeeTransaction) => ({
	file: location.file,
	line: location.line,
	date: date.toString(),
	time: time?.toString({ smallestUnit: 'minute' }) ?? null,
	description,
	postings: postings.map((p) => ({
		account: p.account,
		amount: formatQuantity(p),
		price: p.price === null ? null : `${PRICE_SIGN[p.price.kind]} ${formatQuantity(p.price)}`,
	})),
});
