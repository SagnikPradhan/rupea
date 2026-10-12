import { ok } from '#lib/server/shared/result/result.ts';
import { type Reply, replyFrom, replyFromBatch } from '#lib/server/shared/result/reply.ts';
import * as Auth from '#services/auth/application/auth.ts';
import * as Extraction from '#services/extraction/application/extraction.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { viewTransaction } from '#services/ledger/application/shared.ts';
import { command, form } from '$app/server';
import * as v from 'valibot';
import { Account, Handle, inLedger, Key, SchemaKey } from './shared';

const ExtractStatement = v.object({
	handle: Handle,
	file: v.file(),
	password: v.optional(v.string()),
	schema: SchemaKey,
	account: Account,
});

const CheckDraft = v.object({ key: Key, content: v.string() });

export const extractStatement = form(
	ExtractStatement,
	async ({
		handle,
		file,
		password,
		schema,
		account,
	}): Promise<Reply<{ key: string; content: string }>> => {
		const content = new Uint8Array(await file.arrayBuffer());
		const draft = await inLedger({
			handle,
			action: (ledger, user) =>
				Extraction.extract({
					user: user.id,
					ledger,
					schema,
					account,
					// An empty password field means no password.
					file: { name: file.name, content, password: password || undefined },
				}),
		});
		if (draft.isErr()) return replyFrom(draft);
		const { key, content: text, failed } = draft.value;
		return {
			ok: failed.length === 0,
			data: { key, content: text },
			errors: failed,
		};
	},
);

export const checkDraft = command(CheckDraft, async ({ key, content }) => {
	const checked = Auth.withCurrentUser(() => ok(Ledger.check(key, content)));
	return replyFromBatch(
		await checked.map((batch) => ({
			...batch,
			succeeded: batch.succeeded.map(viewTransaction),
		})),
	);
});
