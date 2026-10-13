import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Extraction from '#services/extraction/application/extraction.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { Handle, inLedger, SchemaKey } from './shared';

export const getSchemas = query(Handle, async (h) =>
	replyFrom(await inLedger({ handle: h, action: Extraction.listSchemas })),
);

export const getSchema = query(
	v.object({ handle: Handle, key: SchemaKey }),
	async ({ handle, key }) =>
		replyFrom(await inLedger({ handle, action: (l) => Extraction.readSchema(l, key) })),
);

export const saveSchema = command(
	v.object({ handle: Handle, key: SchemaKey, content: v.string() }),
	async ({ handle, key, content }) => {
		const saved = await inLedger({
			handle,
			action: (l) => Extraction.saveSchema({ ledger: l, key, content }),
		});
		void getSchemas(handle).refresh();
		return replyFrom(saved);
	},
);

export const deleteSchema = command(
	v.object({ handle: Handle, key: SchemaKey }),
	async ({ handle, key }) => {
		const deleted = await inLedger({ handle, action: (l) => Extraction.deleteSchema(l, key) });
		if (deleted.isOk()) void getSchemas(handle).refresh();
		return replyFrom(deleted);
	},
);
