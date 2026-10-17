import { redirect } from '@sveltejs/kit';
import * as Ledger from '#services/ledger/application/ledger.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) redirect(303, '/sign-in');

	const ledgers = await Ledger.listLedgers(user.id);
	return {
		ledgers: ledgers.match(
			(l) => l.map((x) => ({ handle: x.handle, name: x.name, owned: x.owner === user.id })),
			() => [],
		),
	};
};
