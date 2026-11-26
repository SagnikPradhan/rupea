import { readTheme } from '#lib/web/shared/theme.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user && {
		username: locals.user.username,
		email: locals.user.email,
		local: locals.local,
	},
	theme: readTheme(),
});
