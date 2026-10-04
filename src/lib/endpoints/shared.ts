/** Shared by the remote functions. */
import { formatAmount, type RupeeTransaction } from '#lib/server/services/ledger/domain/types.ts';
import * as v from 'valibot';

/** A key the ledger indexes: a `.rupee` file. */
export const Key = v.pipe(
	v.string(),
	v.nonEmpty(),
	v.endsWith('.rupee', 'Ledger files end in .rupee.'),
);

/** A statement schema's key, under the ledger's `schemas/`. */
export const SchemaKey = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty(),
	v.endsWith('.yml', 'Schemas end in .yml.'),
);

/**
 * A transaction shaped for the wire: dates and times as ISO text and amounts
 * as exact decimal text.
 */
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
	postings: postings.map(({ account, amount }) => ({
		account,
		amount: amount === null ? null : formatAmount(amount),
	})),
});
