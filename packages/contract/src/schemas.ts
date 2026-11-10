import { oc } from '@orpc/contract';
import { EntryOut, FileOut, SchemaContent, SchemaKey } from '@rupea/shared/files.ts';
import * as v from 'valibot';
import { errors } from './errors.ts';

const Handle = v.string();

/** The extraction schemas of the ledger, without their text. */
export const listSchemas = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/schemas', operationId: 'listSchemas' })
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(EntryOut));

/** An extraction schema with its text. */
export const readSchema = oc
	.route({ method: 'GET', path: '/ledgers/{handle}/schemas/{key}', operationId: 'readSchema' })
	.input(v.object({ handle: Handle, key: SchemaKey }))
	.errors(errors)
	.output(FileOut);

/** Writes a schema that reads, replacing the one by that key. */
export const saveSchema = oc
	.route({ method: 'PUT', path: '/ledgers/{handle}/schemas/{key}', operationId: 'saveSchema' })
	.input(v.object({ handle: Handle, key: SchemaKey, content: SchemaContent }))
	.errors(errors)
	.output(FileOut);

export const deleteSchema = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/schemas/{key}',
		operationId: 'deleteSchema',
	})
	.input(v.object({ handle: Handle, key: SchemaKey }))
	.errors(errors);
