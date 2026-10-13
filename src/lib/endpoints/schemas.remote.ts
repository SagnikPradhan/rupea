import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Extraction from '#services/extraction/application/extraction.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { SchemaKey } from './shared';

export const getSchemas = query(async () =>
	replyFrom(await Auth.withCurrentUser(({ id }) => Extraction.listSchemas(id))),
);

export const getSchema = query(SchemaKey, async (k) =>
	replyFrom(await Auth.withCurrentUser(({ id }) => Extraction.readSchema(id, k))),
);

export const saveSchema = command(
	v.object({ key: SchemaKey, content: v.string() }),
	async ({ key, content }) => {
		const saved = await Auth.withCurrentUser(({ id }) =>
			Extraction.saveSchema({ user: id, key, content }),
		);
		void getSchemas().refresh();
		return replyFrom(saved);
	},
);

export const deleteSchema = command(SchemaKey, async (k) => {
	const deleted = await Auth.withCurrentUser(({ id }) => Extraction.deleteSchema(id, k));
	if (deleted.isOk()) void getSchemas().refresh();
	return replyFrom(deleted);
});
