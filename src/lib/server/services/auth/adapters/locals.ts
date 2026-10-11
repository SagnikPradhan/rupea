import { getRequestEvent } from '$app/server';

export const requestUser = () => getRequestEvent().locals.user;
