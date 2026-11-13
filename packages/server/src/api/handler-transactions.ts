import * as Files from '#services/ledger/application/files.ts';
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

const listTransactions = os.transactions.list
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

const listPostings = os.transactions.listPostings
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

const findTransactionFiles = os.transactions.findFiles
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Files.findTransactionFiles }));

const createTransaction = os.transactions.create
	.use(signedIn)
	.handler(({ input: { handle, form } }) =>
		inLedger({ handle, action: (l) => Files.createTransaction({ ledger: l, form }) }),
	);

const findTransaction = os.transactions.find
	.use(signedIn)
	.handler(({ input: { handle, id } }) =>
		inLedger({ handle, action: (l) => Files.findTransaction({ ledger: l, id }) }),
	);

const saveTransaction = os.transactions.save
	.use(signedIn)
	.handler(({ input: { handle, file, line, version, form } }) =>
		inLedger({
			handle,
			action: (l) => Files.saveTransaction({ ledger: l, file, line, version, form }),
		}),
	);

const deleteTransaction = os.transactions.delete
	.use(signedIn)
	.handler(async ({ input: { handle, file, line, version } }) => {
		await inLedger({
			handle,
			action: (l) => Files.deleteTransaction({ ledger: l, file, line, version }),
		});
	});

export const transactions = {
	list: listTransactions,
	listPostings,
	create: createTransaction,
	find: findTransaction,
	save: saveTransaction,
	delete: deleteTransaction,
	findFiles: findTransactionFiles,
};
