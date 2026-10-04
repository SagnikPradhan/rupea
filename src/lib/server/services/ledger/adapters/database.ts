/**
 * Outbound persistence adapter for the ledger index: the transactions each
 * `.rupee` file parsed to, scoped to one ledger. Derived data; the files stay
 * the source of truth. Every query runs through `attempt`.
 */
import { withContext } from '#lib/server/shared/context.ts';
import { attempt, err, ok, type Result, type ResultAsync } from '#lib/server/shared/result.ts';
import type { Amount, RupeeTransaction } from '../domain/types';

/** What the index knows about a file. */
export type IndexedFile = { key: string; version: string | null };

export type IndexedTransaction = RupeeTransaction & { id: string };

/** Every file in the index. */
const files = (ledgerId: string) => (): ResultAsync<IndexedFile[]> =>
	withContext('db')((db) =>
		attempt(() => db.orm.LedgerFile.select('key', 'version').where({ ledgerId }).all()),
	);

/**
 * Replace what the index holds for `key` with `transactions`, recording the
 * file at `version`.
 */
const put =
	(ledgerId: string) =>
	(key: string, version: string | null, transactions: RupeeTransaction[]): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db.transaction(async (tx) => {
					const file = await tx.orm.LedgerFile.upsert({
						create: { ledgerId, key, version },
						update: { version },
						conflictOn: { ledgerId, key },
					});
					await tx.orm.Transaction.where({ fileId: file.id }).deleteAll();
					for (const transaction of transactions)
						await tx.orm.Transaction.create({
							fileId: file.id,
							line: transaction.location.line,
							date: transaction.date.toString(),
							time: transaction.time?.toString() ?? null,
							description: transaction.description,
							postings: (postings) =>
								postings.create(
									transaction.postings.map(({ account, amount }, position) => ({
										position,
										account,
										amount,
									})),
								),
						});
				}),
			),
		);

const remove =
	(ledgerId: string) =>
	(key: string): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db.orm.LedgerFile.where({ ledgerId, key })
					.deleteAll()
					.then(() => undefined),
			),
		);

/** Move a file's entry to a new key; its content, and so version, is unchanged. */
const rename =
	(ledgerId: string) =>
	(from: string, to: string): ResultAsync<void> =>
		withContext('db')((db) =>
			attempt(() =>
				db.orm.LedgerFile.where({ ledgerId, key: from })
					.updateAll({ key: to })
					.then(() => undefined),
			),
		);

/** Untimed transactions sort before the timed ones of their day. */
const compareTimes = (a: Temporal.PlainTime | null, b: Temporal.PlainTime | null) =>
	a && b ? Temporal.PlainTime.compare(a, b) : Number(a !== null) - Number(b !== null);

/** Every indexed transaction, by date and time, then file and line. */
const transactions = (ledgerId: string) => (): ResultAsync<IndexedTransaction[]> =>
	withContext('db')((db) =>
		attempt(async () => {
			const indexed = await db.orm.LedgerFile.select('key')
				.where({ ledgerId })
				.include('transactions', (transactions) =>
					transactions
						.select('id', 'line', 'date', 'time', 'description')
						.include('postings', (q) =>
							q.select('account', 'amount').orderBy((p) => p.position.asc()),
						),
				)
				.all();
			return indexed
				.flatMap(({ key, transactions }) =>
					transactions.map(({ id, line, date, time, description, postings }) => ({
						id,
						location: { file: key, line },
						date: Temporal.PlainDate.from(date),
						time: time === null ? null : Temporal.PlainTime.from(time),
						description,
						postings: postings.map(({ account, amount }) => ({
							account,
							amount: amount as Amount,
						})),
					})),
				)
				.sort(
					(a, b) =>
						Temporal.PlainDate.compare(a.date, b.date) ||
						compareTimes(a.time, b.time) ||
						a.location.file.localeCompare(b.location.file) ||
						a.location.line - b.location.line,
				);
		}),
	);

/** One ledger's index. */
export const index = (ledgerId: string) => ({
	files: files(ledgerId),
	put: put(ledgerId),
	remove: remove(ledgerId),
	rename: rename(ledgerId),
	transactions: transactions(ledgerId),
});

/** The ledger `userId` is working in. */
export const findLedgerId = (userId: string): ResultAsync<string> =>
	withContext('db')((db) =>
		attempt(() => db.orm.User.select('ledgerId').where({ id: userId }).first()).andThen(
			(f): Result<string> =>
				f?.ledgerId ? ok(f.ledgerId) : err({ type: 'LedgerNotFound', userId, cause: [] }),
		),
	);
