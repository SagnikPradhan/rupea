import * as Schemas from '#services/extraction/application/schemas.ts';
import { inLedger, os, signedIn } from './session.ts';
import { entryOf, fileOf } from './shapes.ts';

export const listSchemas = os.listSchemas.use(signedIn).handler(async ({ input }) => {
	const listed = await inLedger({ handle: input.handle, action: Schemas.listSchemas });

	return listed.map(entryOf);
});

export const readSchema = os.readSchema
	.use(signedIn)
	.handler(async ({ input: { handle, key } }) =>
		fileOf(await inLedger({ handle, action: (l) => Schemas.readSchema({ ledger: l, key }) })),
	);

export const saveSchema = os.saveSchema
	.use(signedIn)
	.handler(async ({ input: { handle, key, content } }) =>
		fileOf(
			await inLedger({ handle, action: (l) => Schemas.saveSchema({ ledger: l, key, content }) }),
		),
	);

export const deleteSchema = os.deleteSchema
	.use(signedIn)
	.handler(async ({ input: { handle, key } }) => {
		await inLedger({ handle, action: (l) => Schemas.deleteSchema({ ledger: l, key }) });
	});
