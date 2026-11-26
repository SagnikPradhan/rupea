import { createORPCClient } from '@orpc/client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { type Client, contract } from '@rupea/contract/contract.ts';
import { getRequestEvent } from '$app/server';

type Options = {
	url: string;
	token: string | null;
	fetch?: (request: Request) => Promise<Response>;
};

/**
 * A client of the API that sends the session token, if there is one, as a
 * bearer.
 */
export const createClient = ({ url, token, fetch = globalThis.fetch }: Options): Client =>
	createORPCClient(
		new OpenAPILink(contract, {
			url,
			fetch,
			headers: token ? { authorization: `Bearer ${token}` } : {},
		}),
	);

/**
 * The client of this request, which the hook made with the session cookie's
 * token.
 */
export const api = (): Client => getRequestEvent().locals.api;
