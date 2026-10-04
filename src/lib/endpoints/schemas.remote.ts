/**
 * Inbound adapter for the current ledger's extraction schemas: the YAML
 * files that say how to read a bank statement.
 */
import * as v from 'valibot';
import { command, query } from '$app/server';
import * as Auth from '#lib/server/services/auth/application/auth.ts';
import * as Extraction from '#lib/server/services/extraction/application/extraction.ts';
import { fromResult } from '#lib/server/shared/result.ts';
import { SchemaKey } from './shared';

const SaveSchema = v.object({ key: SchemaKey, content: v.string() });

export const getSchemas = query(async () =>
	fromResult(await Auth.withCurrentUser(({ id }) => Extraction.listSchemas(id))),
);

export const getSchema = query(SchemaKey, async (k) =>
	fromResult(await Auth.withCurrentUser(({ id }) => Extraction.readSchema(id, k))),
);

/** Save a schema; one that does not parse is refused with the reason. */
export const saveSchema = command(SaveSchema, async ({ key, content }) => {
	const saved = await Auth.withCurrentUser(({ id }) =>
		Extraction.saveSchema({ userId: id, key, content }),
	);
	void getSchemas().refresh();
	return fromResult(saved);
});
