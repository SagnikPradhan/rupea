import * as Schemas from '#services/extraction/application/schemas.ts';
import { inLedger, os, signedIn } from './session.ts';
import { entryOf, fileOf } from './shapes.ts';

const listSchemas = os.schemas.list.use(signedIn).handler(async ({ input }) => {
	const listed = await inLedger({ handle: input.handle, action: Schemas.listSchemas });

	return listed.map(entryOf);
});

const readSchema = os.schemas.read
	.use(signedIn)
	.handler(async ({ input: { handle, key } }) =>
		fileOf(await inLedger({ handle, action: (l) => Schemas.readSchema({ ledger: l, key }) })),
	);

const saveSchema = os.schemas.save
	.use(signedIn)
	.handler(async ({ input: { handle, key, content } }) =>
		fileOf(
			await inLedger({ handle, action: (l) => Schemas.saveSchema({ ledger: l, key, content }) }),
		),
	);

const deleteSchema = os.schemas.delete.use(signedIn).handler(async ({ input: { handle, key } }) => {
	await inLedger({ handle, action: (l) => Schemas.deleteSchema({ ledger: l, key }) });
});

export const schemas = {
	list: listSchemas,
	read: readSchema,
	save: saveSchema,
	delete: deleteSchema,
};
