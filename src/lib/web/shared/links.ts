/** Opens a ledger file in the editor, at a 1-based line when given. */
export const fileHref = (handle: string, file: string, line: number | string | null = null) => {
	const query = new URLSearchParams(line === null ? { file } : { file, line: String(line) });
	return `/l/${handle}/files?${query}`;
};

/** Opens a ledger's postings, narrowed by the query. */
export const postingsHref = (h: string, q: Record<string, string>) =>
	`/l/${h}/postings?${new URLSearchParams(q)}`;

/** Opens the lots of a commodity, narrowed by the query. */
export const lotsHref = (h: string, q: Record<string, string>) =>
	`/l/${h}/accounts/lots?${new URLSearchParams(q)}`;

/** A page's query with some values changed; an empty value drops its key. */
export const hrefWith = (
	params: Iterable<[string, string]>,
	changes: Record<string, string | undefined>,
) => {
	const merged = { ...Object.fromEntries(params), ...changes };
	return `?${new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])))}`;
};

/** A page's query opened on one transaction in its aside. */
export const editHref = (p: Iterable<[string, string]>, id: string) =>
	hrefWith(p, { add: '', edit: id });
