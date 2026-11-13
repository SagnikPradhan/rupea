import { redirect } from '@sveltejs/kit';
import { replyFromCall } from '#lib/endpoints/reply.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/sign-in');

	const listed = await replyFromCall(locals.api.listLedgers());
	return { ledgers: listed.data ?? [], failure: listed.errors[0]?.type ?? null };
};
