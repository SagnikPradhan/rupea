import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Extraction from '#services/extraction/application/extraction.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { SchemaKey } from './shared';

const SaveSchema = v.object({ key: SchemaKey, content: v.string() });

export const getSchemas = query(async () =>
	replyFrom(await Auth.withCurrentUser(({ id }) => Extraction.listSchemas(id))),
);

export const getSchema = query(SchemaKey, async (k) =>
	replyFrom(await Auth.withCurrentUser(({ id }) => Extraction.readSchema(id, k))),
);

export const saveSchema = command(SaveSchema, async ({ key, content }) => {
	const saved = await Auth.withCurrentUser(({ id }) =>
		Extraction.saveSchema({ user: id, key, content }),
	);
	void getSchemas().refresh();
	return replyFrom(saved);
});
