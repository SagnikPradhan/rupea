import { dev } from '$app/env';
import { getRequestEvent } from '$app/server';

/** Sets a cookie only the server reads, kept until `life` runs out. */
export const setCookie = (
	name: string,
	value: string,
	life: { maxAge: number } | { expires: Date },
) =>
	getRequestEvent().cookies.set(name, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		...life,
	});
