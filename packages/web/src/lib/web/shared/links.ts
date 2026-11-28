import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { ResolvedPathname } from '$app/types';

/** Opens a ledger file in the editor, at a 1-based line when given. */
export const fileHref = (handle: string, file: string, line: number | string | null = null) => {
	const query = new URLSearchParams(line === null ? {} : { line: String(line) });
	return withQuery(
		resolve('/(signed-in)/l/[handle]/files/[...key]', { handle, key: encoded(file) }),
		query,
	);
};

/** Opens a ledger file in the editor, on its transactions as a list to edit. */
export const uiHref = (handle: string, file: string) =>
	withQuery(
		resolve('/(signed-in)/l/[handle]/files/[...key]', { handle, key: encoded(file) }),
		new URLSearchParams({ view: 'ui' }),
	);

/** Opens a ledger's postings, narrowed by the query. */
export const postingsHref = (h: string, q: Record<string, string>) =>
	withQuery(resolve('/(signed-in)/l/[handle]/postings', { handle: h }), new URLSearchParams(q));

/** Opens the lots of a commodity, narrowed by the query. */
export const lotsHref = (h: string, q: Record<string, string>) =>
	withQuery(
		resolve('/(signed-in)/l/[handle]/net-worth/lots', { handle: h }),
		new URLSearchParams(q),
	);

/**
 * Opens a ledger's terms or budgets in settings, at the section they are in; an
 * empty value drops its key but keeps the section.
 */
export const settingsHref = (h: string, q: Record<string, string>) => {
	const section = 'budget' in q || q['add'] === 'budget' ? 'budgets' : 'accounts';
	const kept = Object.entries(q).filter(([, value]) => value !== '');
	const query = new URLSearchParams([['ledger', h], ...kept]);
	return `${withQuery(resolve('/(signed-in)/settings'), query)}#${h}-${section}` as ResolvedPathname;
};

/**
 * The current page on another ledger; home, which holds no ledger, asks for it,
 * and a file, which the other ledger lacks, leads to its files.
 */
export const ledgerHref = (h: string) => {
	if (page.params.handle === undefined || page.route.id === null) return hrefOnly({ ledger: h });
	if (page.params.key !== undefined) return resolve('/(signed-in)/l/[handle]/files', { handle: h });

	return resolve(...([page.route.id, { ...page.params, handle: h }] as Parameters<typeof resolve>));
};

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

/**
 * Kit puts a rest parameter in the path as it is, so each segment is escaped
 * here.
 */
const encoded = (k: string) => k.split('/').map(encodeURIComponent).join('/');

const here = () =>
	page.route.id === null
		? (page.url.pathname as ResolvedPathname)
		: resolve(
				...([
					page.route.id,
					page.params.key === undefined
						? page.params
						: { ...page.params, key: encoded(page.params.key) },
				] as Parameters<typeof resolve>),
			);

/** Kit types a resolved path without its query, so adding one needs the cast. */
const withQuery = (p: ResolvedPathname, q: URLSearchParams) =>
	(q.size === 0 ? p : `${p}?${q}`) as ResolvedPathname;
