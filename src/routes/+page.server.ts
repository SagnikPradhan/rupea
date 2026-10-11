import * as Ledger from '#services/ledger/application/ledger.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) return { ledgers: [] };

	const ledgers = await Ledger.listLedgers(user.id);
	return {
		ledgers: ledgers.match(
			(l) => l.map((x) => ({ handle: x.handle, name: x.name, owned: x.owner === user.id })),
			() => [],
		),
	};
};
