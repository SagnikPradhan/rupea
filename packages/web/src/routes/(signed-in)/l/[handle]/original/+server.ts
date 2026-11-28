import { STATUS } from '@rupea/contract/errors.ts';
import { StatementKey } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/text.ts';
import { replyFromCall } from '#lib/endpoints/reply.ts';
import { headersForOriginal } from '#lib/web/shared/statements.ts';
import * as v from 'valibot';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const handle = v.safeParse(Handle, params.handle);
	const key = v.safeParse(StatementKey, url.searchParams.get('key'));
	if (!handle.success || !key.success) return new Response('Not a statement.', { status: 400 });

	const read = await replyFromCall(
		locals.api.statements.readOriginal({ handle: handle.output, statement: key.output }),
	);
	if (!read.data)
		return new Response('Not found.', { status: STATUS[read.errors[0]?.type ?? 'UnknownError'] });

	return new Response(read.data, { headers: headersForOriginal(key.output) });
};
