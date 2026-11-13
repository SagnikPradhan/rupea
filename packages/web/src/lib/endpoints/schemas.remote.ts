import { SchemaContent, SchemaKey } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/handle.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { api } from './api';
import { replyFromCall } from './reply';

export const listSchemas = query(Handle, (h) => replyFromCall(api().schemas.list({ handle: h })));

export const readSchema = query(v.object({ handle: Handle, key: SchemaKey }), ({ handle, key }) =>
	replyFromCall(api().schemas.read({ handle, key })),
);

export const saveSchema = command(
	v.object({ handle: Handle, key: SchemaKey, content: SchemaContent }),
	async ({ handle, key, content }) => {
		const saved = await replyFromCall(api().schemas.save({ handle, key, content }));
		void listSchemas(handle).refresh();
		return saved;
	},
);

export const deleteSchema = command(
	v.object({ handle: Handle, key: SchemaKey }),
	async ({ handle, key }) => {
		const deleted = await replyFromCall(api().schemas.delete({ handle, key }));
		void listSchemas(handle).refresh();
		return deleted;
	},
);
