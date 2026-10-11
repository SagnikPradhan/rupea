import { PRICE_SIGN } from '#services/ledger/domain/printer.ts';
import {
	AccountRoot,
	accountRoot,
	formatQuantity,
	type RupeeTransaction,
} from '#services/ledger/domain/types.ts';
import * as v from 'valibot';

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
		(a) => accountRoot(a) !== null,
		`An account starts with one of ${Object.values(AccountRoot).join(', ')}.`,
	),
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
