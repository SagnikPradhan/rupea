import { oc } from '@orpc/contract';
import dedent from 'dedent';
import { EntryOut, FileOut, SchemaContent, SchemaKey } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/text.ts';
import * as v from 'valibot';
import { errors } from './errors.ts';

const listSchemas = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/schemas',
		operationId: 'schemas.list',
		description: dedent`
			Lists the extraction schemas of the ledger by key, without their text.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle }))
	.errors(errors)
	.output(v.array(EntryOut));

const readSchema = oc
	.route({
		method: 'GET',
		path: '/ledgers/{handle}/schemas/{key}',
		operationId: 'schemas.read',
		description: dedent`
			Answers an extraction schema with its text and version.

			Fails with StorageNotFound when there is no such schema. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: SchemaKey }))
	.errors(errors)
	.output(FileOut);

const saveSchema = oc
	.route({
		method: 'PUT',
		path: '/ledgers/{handle}/schemas/{key}',
		operationId: 'schemas.save',
		description: dedent`
			Writes an extraction schema that reads, replacing the one by that key, and
			answers it.

			Fails with LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: SchemaKey, content: SchemaContent }))
	.errors(errors)
	.output(FileOut);

const deleteSchema = oc
	.route({
		method: 'DELETE',
		path: '/ledgers/{handle}/schemas/{key}',
		operationId: 'schemas.delete',
		description: dedent`
			Deletes an extraction schema.

			Fails with StorageNotFound when there is no such schema. Fails with
			LedgerNotFound when the caller cannot open the ledger.
		`,
	})
	.input(v.object({ handle: Handle, key: SchemaKey }))
	.errors(errors);

export const schemas = {
	list: listSchemas,
	read: readSchema,
	save: saveSchema,
	delete: deleteSchema,
};
