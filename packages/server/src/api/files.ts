import * as Files from '#services/ledger/application/files.ts';
import { okAsync } from '#lib/server/shared/result/result.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';
import { entryOf, fileOf, transactionOf } from './shapes.ts';

export const listFiles = os.listFiles.use(signedIn).handler(async ({ input }) => {
	const listed = await inLedger({ handle: input.handle, action: Files.listFiles });

	return listed.map(entryOf);
});

export const findLatestFile = os.findLatestFile
	.use(signedIn)
	.handler(({ input: { handle, account } }) =>
		inLedger({ handle, action: (l) => Files.findLatestFile({ ledger: l, account }) }),
	);

export const findTransactionFiles = os.findTransactionFiles
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Files.findTransactionFiles }));

export const createTransaction = os.createTransaction
	.use(signedIn)
	.handler(({ input: { handle, form } }) =>
		inLedger({ handle, action: (l) => Files.createTransaction({ ledger: l, form }) }),
	);

export const findTransaction = os.findTransaction
	.use(signedIn)
	.handler(({ input: { handle, id } }) =>
		inLedger({ handle, action: (l) => Files.findTransaction({ ledger: l, id }) }),
	);

export const saveTransaction = os.saveTransaction
	.use(signedIn)
	.handler(({ input: { handle, file, line, version, form } }) =>
		inLedger({
			handle,
			action: (l) => Files.saveTransaction({ ledger: l, file, line, version, form }),
		}),
	);

export const deleteTransaction = os.deleteTransaction
	.use(signedIn)
	.handler(async ({ input: { handle, file, line, version } }) => {
		await inLedger({
			handle,
			action: (l) => Files.deleteTransaction({ ledger: l, file, line, version }),
		});
	});

export const readFile = os.readFile
	.use(signedIn)
	.handler(async ({ input: { handle, key } }) =>
		fileOf(await inLedger({ handle, action: (l) => Files.readFile({ ledger: l, key }) })),
	);

export const formatFile = os.formatFile
	.use(signedIn)
	.handler(({ input: { handle, content } }) =>
		inLedger({ handle, action: () => okAsync(Files.formatFile({ content })) }),
	);

export const parseFile = os.parseFile
	.use(signedIn)
	.handler(async ({ input: { handle, key, content } }) => {
		const parsed = sanitiseBatch(
			await inLedger({ handle, action: () => okAsync(Files.parseFile({ key, content })) }),
		);

		return { ...parsed, succeeded: parsed.succeeded.map(transactionOf) };
	});

export const createFile = os.createFile
	.use(signedIn)
	.handler(async ({ input: { handle, key, content } }) =>
		fileOf(
			await inLedger({ handle, action: (l) => Files.createFile({ ledger: l, key, content }) }),
		),
	);

export const editFile = os.editFile
	.use(signedIn)
	.handler(async ({ input: { handle, key, content, version } }) =>
		fileOf(
			await inLedger({
				handle,
				action: (l) => Files.editFile({ ledger: l, key, content, version }),
			}),
		),
	);

export const renameFiles = os.renameFiles
	.use(signedIn)
	.handler(async ({ input: { handle, moves } }) => {
		const renamed = sanitiseBatch(
			await inLedger({ handle, action: (l) => Files.renameFiles({ ledger: l, moves }) }),
		);

		return { ...renamed, succeeded: renamed.succeeded.map(fileOf) };
	});

export const addFile = os.addFile.use(signedIn).handler(async ({ input: { handle, from, to } }) => {
	const added = await inLedger({ handle, action: (l) => Files.addFile({ ledger: l, from, to }) });

	return { ...added, file: entryOf(added.file) };
});

export const deleteFiles = os.deleteFiles
	.use(signedIn)
	.handler(async ({ input: { handle, keys } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Files.deleteFiles({ ledger: l, keys }) }),
		),
	);
