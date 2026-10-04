/** The signed-in user of the current request, as `hooks.server.ts` set it. */
import { getRequestEvent } from '$app/server';

export const requestUser = () => getRequestEvent().locals.user;
