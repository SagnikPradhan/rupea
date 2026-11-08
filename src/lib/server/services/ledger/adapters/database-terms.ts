import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { sql } from 'kysely';
import { displayLocation } from '../domain/parser';

export type TermsRow = {
	account: string;
	since: string | null;
	terms: Record<string, string[]>;
	file: string;
	line: number;
};

/** The terms every A line of a ledger sets, in the order of account and day. */
export const listTerms = (ledgerId: string): ResultAsync<TermsRow[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('accountTerms as t')
				.innerJoin('ledgerFiles as f', 'f.id', 't.fileId')
				.select(['t.account', 't.since', 't.terms', 'f.key as file', 't.line'])
				.where('t.ledgerId', '=', ledgerId)
				.orderBy('t.account')
				.orderBy('t.since', (o) => o.nullsFirst())
				.execute(),
		),
	);

export type RepeatedTerms = { account: string; locations: string[] };

/**
 * Accounts set up more than once from one day, which would leave their terms to
 * chance.
 */
export const listRepeatedTerms = (ledgerId: string): ResultAsync<RepeatedTerms[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('accountTerms as t')
				.innerJoin('ledgerFiles as f', 'f.id', 't.fileId')
				.select((e) => [
					't.account',
					sql<
						{ file: string; line: number }[]
					>`json_agg(json_build_object('file', ${e.ref('f.key')}, 'line', ${e.ref('t.line')}) order by ${e.ref('f.key')}, ${e.ref('t.line')})`.as(
						'locations',
					),
				])
				.where('t.ledgerId', '=', ledgerId)
				.groupBy(['t.account', 't.since'])
				.having((e) => e.fn.countAll(), '>', 1)
				.orderBy('t.account')
				.orderBy('t.since')
				.execute()
				.then((r) =>
					r.map((a) => ({ account: a.account, locations: a.locations.map(displayLocation) })),
				),
		),
	);
