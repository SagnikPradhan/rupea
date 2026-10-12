import { ok } from '#lib/server/shared/result/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const user = locals.user;
	if (!user) redirect(303, '/sign-in');

	const found = await Ledger.withLedger({
		user: user.id,
		handle: params.handle,
		action: (l) => ok({ handle: l.handle, name: l.name }),
	});
	if (found.isErr() && found.error.type === 'LedgerNotFound') error(404, 'No such ledger');
	if (found.isErr()) error(500, found.error.type);

	return { ledger: found.value };
};
