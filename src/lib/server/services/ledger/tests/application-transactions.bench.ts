import * as Transactions from '#services/ledger/application/transactions.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { BEGINNING } from '#lib/shared/dates.ts';
import { cloneFixture, timed } from '#tests/shared/fixtures.ts';
import { it } from '#tests/shared/vitest.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { describe } from 'vitest';

const TO = Temporal.PlainDate.from('2026-10-21');
const ALL: Transactions.ListFilter = {
	from: Temporal.PlainDate.from(BEGINNING),
	to: TO,
	account: null,
	description: null,
};
const LEDGERS = ['fifty-years', 'wide'];
const PAGES_DEEP = 50;

describe('transactions', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);

		const listed = await provide(context, () =>
			Transactions.listTransactions({ ledger, filter: ALL, after: null }),
		);
		const first = listed._unsafeUnwrap();
		const spend = first.rows.find((t) => t.postings.some((p) => p.account.startsWith('Expenses:')));
		const account = spend?.postings.find((p) => p.account.startsWith('Expenses:'))?.account ?? '';
		const word = spend?.description.split(/[ /]/).find((w) => w.length > 4) ?? '';
		const deep = await provide(context, () => pageAfter(ledger, PAGES_DEEP, null));

		const transactions = (f: Partial<Transactions.ListFilter>, a: Transactions.Cursor | null) =>
			timed(context, () =>
				Transactions.listTransactions({ ledger, filter: { ...ALL, ...f }, after: a }),
			);
		const postings = (f: Partial<Transactions.ListFilter>) =>
			timed(context, () =>
				Transactions.listPostings({ ledger, filter: { ...ALL, ...f }, after: null }),
			);

		await bench.compare(
			bench('transactions newest', transactions({}, null)),
			bench('transactions deep page', transactions({}, deep)),
			bench('transactions last month', transactions({ from: TO.subtract({ months: 1 }) }, null)),
			bench('transactions of an account', transactions({ account }, null)),
			bench('transactions by description', transactions({ description: word }, null)),
			bench('postings newest', postings({})),
			bench('postings of an account', postings({ account })),
			bench('postings by description', postings({ description: word })),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});

/** The cursor that starts a page this many pages down, or of the last page when there are fewer. */
const pageAfter = async (
	ledger: Ledger,
	pages: number,
	after: Transactions.Cursor | null,
): Promise<Transactions.Cursor | null> => {
	const page = await Transactions.listTransactions({ ledger, filter: ALL, after });
	const next = page._unsafeUnwrap().next;

	return pages === 0 || !next ? after : pageAfter(ledger, pages - 1, next);
};
