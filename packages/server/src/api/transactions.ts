import * as Transactions from '#services/ledger/application/transactions.ts';
import { postedOf } from '#services/ledger/application/language.ts';
import { inLedger, os, signedIn } from './session.ts';
import { transactionOf } from './shapes.ts';

type Filter = {
	from: Temporal.PlainDate;
	to: Temporal.PlainDate;
	account?: string | undefined;
	description?: string | undefined;
};

const listed = ({ from, to, account, description }: Filter): Transactions.ListFilter => ({
	from,
	to,
	account: account || null,
	description: description || null,
});

export const listTransactions = os.listTransactions
	.use(signedIn)
	.handler(async ({ input: { handle, after, ...filter } }) => {
		const page = await inLedger({
			handle,
			action: (l) =>
				Transactions.listTransactions({ ledger: l, filter: listed(filter), after: after ?? null }),
		});

		return {
			...page,
			rows: page.rows.map((t) => ({ id: t.id, counted: t.counted, ...transactionOf(t) })),
		};
	});

export const listPostings = os.listPostings
	.use(signedIn)
	.handler(async ({ input: { handle, after, ...filter } }) => {
		const page = await inLedger({
			handle,
			action: (l) =>
				Transactions.listPostings({ ledger: l, filter: listed(filter), after: after ?? null }),
		});

		return {
			...page,
			rows: page.rows.map((p) => ({
				transaction: p.transaction,
				position: p.position,
				file: p.location.file,
				line: p.location.line,
				date: p.date,
				description: p.description,
				account: p.posting.account,
				quantity: postedOf(p.posting),
			})),
		};
	});
