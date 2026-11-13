import { SchemaContent, SchemaKey } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/handle.ts';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { api } from './api';
import { replyFromCall } from './reply';

export const listSchemas = query(Handle, (h) => replyFromCall(api().listSchemas({ handle: h })));

export const readSchema = query(v.object({ handle: Handle, key: SchemaKey }), ({ handle, key }) =>
	replyFromCall(api().readSchema({ handle, key })),
);

export const saveSchema = command(
	v.object({ handle: Handle, key: SchemaKey, content: SchemaContent }),
	async ({ handle, key, content }) => {
		const saved = await replyFromCall(api().saveSchema({ handle, key, content }));
		void listSchemas(handle).refresh();
		return saved;
	},
);

export const deleteSchema = command(
	v.object({ handle: Handle, key: SchemaKey }),
	async ({ handle, key }) => {
		const deleted = await replyFromCall(api().deleteSchema({ handle, key }));
		void listSchemas(handle).refresh();
		return deleted;
	},
);
