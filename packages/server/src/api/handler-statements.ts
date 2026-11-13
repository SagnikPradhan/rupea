import * as Drafts from '#services/extraction/application/drafts.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import * as Statements from '#services/extraction/application/statements.ts';
import * as Uploads from '#services/extraction/application/uploads.ts';
import { sanitise, sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';
import { transactionOf } from './shapes.ts';

const uploadStatements = os.statements.upload
	.use(signedIn)
	.handler(async ({ input: { handle, files }, context }) => {
		const user = context.session.user.id;
		const uploads = files.map((f) => ({
			name: f.name,
			read: () => f.arrayBuffer().then((b) => new Uint8Array(b)),
		}));

		return sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Uploads.uploadStatements({ ledger: l, user, uploads }),
			}),
		);
	});

const listStatements = os.statements.list
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Uploads.listStatements }));

const listImports = os.statements.listImports.use(signedIn).handler(async ({ input, context }) => {
	const user = context.session.user.id;
	const listed = await inLedger({
		handle: input.handle,
		action: (l) => Uploads.listImports({ ledger: l, user }),
	});

	return listed.map((j) => ({ ...j, error: j.error && sanitise(j.error) }));
});

const readStatement = os.statements.read
	.use(signedIn)
	.handler(async ({ input: { handle, statement } }) => {
		const read = await inLedger({
			handle,
			action: (l) => Statements.readStatement({ ledger: l, key: statement }),
		});

		return { key: read.key, grid: read.grid };
	});

const deleteStatements = os.statements.delete
	.use(signedIn)
	.handler(async ({ input: { handle, keys } }) =>
		sanitiseBatch(
			await inLedger({ handle, action: (l) => Statements.deleteStatements({ ledger: l, keys }) }),
		),
	);

const unlockStatement = os.statements.unlock
	.use(signedIn)
	.handler(async ({ input: { handle, statement, password } }) => {
		const unlocked = await inLedger({
			handle,
			action: (l) => Statements.unlockStatement({ ledger: l, statement, password }),
		});

		return { key: unlocked.key, grid: unlocked.grid };
	});

const recogniseStatement = os.statements.recognise
	.use(signedIn)
	.handler(({ input: { handle, statement } }) =>
		inLedger({
			handle,
			action: (l) => Schemas.recogniseStatement({ ledger: l, statement }),
		}),
	);

const previewStatement = os.statements.preview
	.use(signedIn)
	.handler(async ({ input: { handle, statement, schema } }) => {
		const previewed = sanitiseBatch(
			await inLedger({
				handle,
				action: (l) => Drafts.previewStatement({ ledger: l, statement, schema }),
			}),
		);

		return { ...previewed, succeeded: previewed.succeeded.map(transactionOf) };
	});

const importStatement = os.statements.import
	.use(signedIn)
	.handler(async ({ input: { handle, statement, schema } }) => {
		const created = await inLedger({
			handle,
			action: (l) => Drafts.importStatement({ ledger: l, statement, schema }),
		});

		return { key: created.key };
	});

export const statements = {
	upload: uploadStatements,
	list: listStatements,
	listImports,
	read: readStatement,
	delete: deleteStatements,
	unlock: unlockStatement,
	recognise: recogniseStatement,
	preview: previewStatement,
	import: importStatement,
};
