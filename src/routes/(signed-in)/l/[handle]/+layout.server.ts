import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, parent }) => {
	const { ledgers, failure } = await parent();
	if (failure) error(500, failure);

	const ledger = ledgers.find((l) => l.handle === params.handle);
	if (!ledger) error(404, 'No such ledger');

	return { ledger: { handle: ledger.handle, name: ledger.name } };
};
