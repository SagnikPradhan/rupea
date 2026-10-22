import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger, SchemaKey } from './shared';

export const listSchemas = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Schemas.listSchemas })),
);

export const readSchema = query(v.object({ handle: Handle, key: SchemaKey }), ({ handle, key }) =>
	replyFrom(inLedger({ handle, action: (l) => Schemas.readSchema({ ledger: l, key }) })),
);

export const saveSchema = command(
	v.object({ handle: Handle, key: SchemaKey, content: v.string() }),
	async ({ handle, key, content }) => {
		const saved = await inLedger({
			handle,
			action: (l) => Schemas.saveSchema({ ledger: l, key, content }),
		});
		void listSchemas(handle).refresh();
		return replyFrom(saved);
	},
);

export const deleteSchema = command(
	v.object({ handle: Handle, key: SchemaKey }),
	async ({ handle, key }) => {
		const deleted = await inLedger({
			handle,
			action: (l) => Schemas.deleteSchema({ ledger: l, key }),
		});
		if (deleted.isOk()) void listSchemas(handle).refresh();
		return replyFrom(deleted);
	},
);
