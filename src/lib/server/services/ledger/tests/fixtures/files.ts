import { scoped, type Storage } from '#lib/server/shared/storage/storage.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt } from '#lib/server/shared/result/result.ts';
import * as DB from '#services/ledger/adapters/database.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import * as Transactions from '#services/ledger/application/transactions.ts';

export const groceries = '2026-08-29 Groceries\n\tExpenses:Food 100.5\n\tAssets:Bank\n';
export const salary = '2026-08-01 Salary\n\tAssets:Bank 50000\n\tIncome:Salary\n';

// Where the ledger's files are, in a storage holding every user's.
export const stored = (s: Storage, l: Ledger) =>
	scoped(s, `users/${l.owner}/ledgers/${l.handle}/files`);

export const put = (storage: Storage, ledger: Ledger, key: string, text: string) =>
	stored(storage, ledger).write({
		key,
		content: new TextEncoder().encode(text),
	});

/** Every transaction of the ledger, oldest id first, which a request never reads. */
export const listAllTransactions = (ledgerId: string) =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('transactions')
				.select('id')
				.where('ledgerId', '=', ledgerId)
				.orderBy('id')
				.execute(),
		),
	).andThen((r) =>
		DB.findTransactions(
			ledgerId,
			r.map((t) => t.id),
		),
	);

export const summary = async (ledgerId: string) => {
	const indexed = await listAllTransactions(ledgerId);
	return indexed.isOk()
		? indexed.value.map(
				({ location, description }) => `${location.file}:${location.line} ${description}`,
			)
		: indexed;
};

/** A filter that leaves every side open. */
export const everything = {
	from: Temporal.PlainDate.from('0001-01-01'),
	to: Temporal.PlainDate.from('9999-12-31'),
	account: null,
	description: null,
};

/** The first page of the ledger's transactions, newest first. */
export const listed = async (l: Ledger) =>
	(
		await Transactions.listTransactions({ ledger: l, filter: everything, after: null })
	)._unsafeUnwrap().rows;

/** What the ledger shows wrong once synced: the problems sync kept and what the checks find. */
export const issues = (l: Ledger) =>
	Sync.syncIndex(l)
		.andThen(() => Sync.listProblems(l))
		.map((b) => b.failed);
