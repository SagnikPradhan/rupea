import { readTheme } from '#lib/server/shared/theme.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user && { username: locals.user.username },
	theme: readTheme(),
});
