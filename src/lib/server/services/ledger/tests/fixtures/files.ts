import { scoped, type Storage } from '#lib/server/shared/storage/storage.ts';
import { listAllTransactions } from '#services/ledger/adapters/database-transactions.ts';
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

/** What a sync reports wrong with the ledger. */
export const issues = (l: Ledger) => Sync.sync(l).map((b) => b.failed);
