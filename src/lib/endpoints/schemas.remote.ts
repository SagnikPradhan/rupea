import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger, SchemaKey } from './shared';

export const getSchemas = query(Handle, async (h) =>
	replyFrom(await inLedger({ handle: h, action: Schemas.listSchemas })),
);

export const getSchema = query(
	v.object({ handle: Handle, key: SchemaKey }),
	async ({ handle, key }) =>
		replyFrom(await inLedger({ handle, action: (l) => Schemas.readSchema(l, key) })),
);

export const saveSchema = command(
	v.object({ handle: Handle, key: SchemaKey, content: v.string() }),
	async ({ handle, key, content }) => {
		const saved = await inLedger({
			handle,
			action: (l) => Schemas.saveSchema({ ledger: l, key, content }),
		});
		void getSchemas(handle).refresh();
		return replyFrom(saved);
	},
);

export const deleteSchema = command(
	v.object({ handle: Handle, key: SchemaKey }),
	async ({ handle, key }) => {
		const deleted = await inLedger({ handle, action: (l) => Schemas.deleteSchema(l, key) });
		if (deleted.isOk()) void getSchemas(handle).refresh();
		return replyFrom(deleted);
	},
);
