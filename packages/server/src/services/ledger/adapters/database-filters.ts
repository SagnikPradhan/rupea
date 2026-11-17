import type { Database } from '#lib/server/db/index.ts';
import { expressionBuilder, sql, type Expression, type SqlBool } from 'kysely';
import type { Filter, Test } from '../domain/filters';

type ConditionOptions = {
	filter: Filter;
	ledgerId: string;
	account: Expression<string>;
	/**
	 * The transaction of the posting, or null where postings are added up and a
	 * counter passes none.
	 */
	transaction: Expression<string> | null;
};

/** The condition under which a posting passes the filter, with its values bound. */
export const conditionFor = (db: Database, o: ConditionOptions): Expression<SqlBool> => {
	const { filter } = o;
	const eb = expressionBuilder();

	if (filter.kind === 'all')
		return eb.and(filter.of.map((f) => conditionFor(db, { ...o, filter: f })));
	if (filter.kind === 'any' && filter.of.length > 0 && filter.of.every((f) => f.kind === 'account'))
		return sql<SqlBool>`${o.account} in ${named(
			db,
			o,
			filter.of.map((f) => f.name),
		)}`;
	if (filter.kind === 'any')
		return eb.or(filter.of.map((f) => conditionFor(db, { ...o, filter: f })));
	if (filter.kind === 'not') return eb.not(conditionFor(db, { ...o, filter: filter.of }));
	if (filter.kind === 'account')
		return sql<SqlBool>`${o.account} in ${named(db, o, [filter.name])}`;

	const { ledgerId, account, transaction } = o;
	if (transaction === null) return eb.lit(false);

	return eb.exists(counterOf(db, { test: filter.test, ledgerId, account, transaction }));
};

/**
 * The accounts of the ledger with one of these names, or under one, in any
 * case.
 */
const named = (db: Database, { ledgerId }: ConditionOptions, names: string[]) =>
	db
		.selectFrom('accounts as a')
		.select('a.id')
		.where('a.ledgerId', '=', ledgerId)
		.where((e) =>
			e.or(
				names.flatMap((name) => [
					sql<SqlBool>`lower(${e.ref('a.name')}) = lower(${name})`,
					sql<SqlBool>`starts_with(lower(${e.ref('a.name')}), lower(${name}) || ':')`,
				]),
			),
		);

type CounterOptions = {
	test: Test;
	ledgerId: string;
	account: Expression<string>;
	transaction: Expression<string>;
};

/** The other postings of the transaction, on other accounts, that pass the test. */
const counterOf = (db: Database, { test, ledgerId, account, transaction }: CounterOptions) =>
	db
		.selectFrom('postings as q')
		.select('q.id')
		.where('q.ledgerId', '=', ledgerId)
		.where('q.transactionId', '=', transaction)
		.where('q.accountId', '<>', account)
		.where(() =>
			conditionFor(db, {
				filter: test,
				ledgerId,
				account: sql.ref<string>('q.accountId'),
				transaction: null,
			}),
		);
