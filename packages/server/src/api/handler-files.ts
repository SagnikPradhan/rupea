import * as Files from '#services/ledger/application/files.ts';
import { okAsync } from '#lib/server/shared/result/result.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';
import { entryOf, fileOf, transactionOf } from './shapes.ts';

const listFiles = os.files.list.use(signedIn).handler(async ({ input }) => {
	const listed = await inLedger({ handle: input.handle, action: Files.listFiles });

	return listed.map(entryOf);
});

const findLatestFile = os.files.findLatest
	.use(signedIn)
	.handler(({ input: { handle, account } }) =>
		inLedger({ handle, action: (l) => Files.findLatestFile({ ledger: l, account }) }),
	);

const readFile = os.files.read
	.use(signedIn)
	.handler(async ({ input: { handle, key } }) =>
		fileOf(await inLedger({ handle, action: (l) => Files.readFile({ ledger: l, key }) })),
	);

const formatFile = os.files.format
	.use(signedIn)
	.handler(({ input: { handle, content } }) =>
		inLedger({ handle, action: () => okAsync(Files.formatFile({ content })) }),
	);

const parseFile = os.files.parse
	.use(signedIn)
	.handler(async ({ input: { handle, key, content } }) => {
		const parsed = sanitiseBatch(
			await inLedger({ handle, action: () => okAsync(Files.parseFile({ key, content })) }),
		);

		return { ...parsed, succeeded: parsed.succeeded.map(transactionOf) };
	});

const createFile = os.files.create
	.use(signedIn)
	.handler(async ({ input: { handle, key, content } }) =>
		fileOf(
			await inLedger({ handle, action: (l) => Files.createFile({ ledger: l, key, content }) }),
		),
	);

const editFile = os.files.edit
	.use(signedIn)
	.handler(async ({ input: { handle, key, content, version } }) =>
		fileOf(
			await inLedger({
				handle,
				action: (l) => Files.editFile({ ledger: l, key, content, version }),
			}),
		),
	);

const renameFiles = os.files.rename.use(signedIn).handler(async ({ input: { handle, moves } }) => {
	const renamed = sanitiseBatch(
		await inLedger({ handle, action: (l) => Files.renameFiles({ ledger: l, moves }) }),
	);

	return { ...renamed, succeeded: renamed.succeeded.map(fileOf) };
});

const addFile = os.files.add.use(signedIn).handler(async ({ input: { handle, from, to } }) => {
	const added = await inLedger({ handle, action: (l) => Files.addFile({ ledger: l, from, to }) });

	return { ...added, file: entryOf(added.file) };
});

const deleteFiles = os.files.delete
	.use(signedIn)
	.handler(async ({ input: { handle, keys } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Files.deleteFiles({ ledger: l, keys }) }),
		),
	);

export const files = {
	list: listFiles,
	findLatest: findLatestFile,
	read: readFile,
	format: formatFile,
	parse: parseFile,
	create: createFile,
	edit: editFile,
	rename: renameFiles,
	add: addFile,
	delete: deleteFiles,
};
