import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { ResolvedPathname } from '$app/types';

/** Opens a ledger file in the editor, at a 1-based line when given. */
export const fileHref = (handle: string, file: string, line: number | string | null = null) => {
	const query = new URLSearchParams(line === null ? { file } : { file, line: String(line) });
	return withQuery(resolve('/(signed-in)/l/[handle]/files', { handle }), query);
};

/** Opens a ledger's postings, narrowed by the query. */
export const postingsHref = (h: string, q: Record<string, string>) =>
	withQuery(resolve('/(signed-in)/l/[handle]/postings', { handle: h }), new URLSearchParams(q));

/** Opens the lots of a commodity, narrowed by the query. */
export const lotsHref = (h: string, q: Record<string, string>) =>
	withQuery(
		resolve('/(signed-in)/l/[handle]/accounts/lots', { handle: h }),
		new URLSearchParams(q),
	);

/** The current page with exactly this query. */
export const hrefOnly = (q: Record<string, string>) => withQuery(here(), new URLSearchParams(q));

/**
 * The current page with some query values changed; an empty value drops its
 * key.
 */
export const hrefWith = (
	params: Iterable<[string, string]>,
	changes: Record<string, string | undefined>,
) => {
	const merged = { ...Object.fromEntries(params), ...changes };
	return hrefOnly(
		Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1]))),
	);
};

/** The current page opened on one transaction in its aside. */
export const editHref = (p: Iterable<[string, string]>, id: string) =>
	hrefWith(p, { add: '', edit: id });

const here = () =>
	page.route.id === null
		? (page.url.pathname as ResolvedPathname)
		: resolve(...([page.route.id, page.params] as Parameters<typeof resolve>));

/** Kit types a resolved path without its query, so adding one needs the cast. */
const withQuery = (p: ResolvedPathname, q: URLSearchParams) =>
	(q.size === 0 ? p : `${p}?${q}`) as ResolvedPathname;
