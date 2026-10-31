/** Opens a ledger file in the editor, at a 1-based line when given. */
export const fileHref = (handle: string, file: string, line: number | string | null = null) => {
	const query = new URLSearchParams(line === null ? { file } : { file, line: String(line) });
	return `/l/${handle}/files?${query}`;
};

/** The first crumb of every ledger page's trail. */
export const ledgerCrumb = (ledger: { handle: string; name: string }) => ({
	href: `/l/${ledger.handle}/transactions`,
	label: ledger.name,
});

/** A page's query with some values changed; an empty value drops its key. */
export const hrefWith = (params: Iterable<[string, string]>, changes: Record<string, string>) => {
	const merged = { ...Object.fromEntries(params), ...changes };
	return `?${new URLSearchParams(Object.entries(merged).filter(([, value]) => value))}`;
};

/** A ledger's pages, grouped; a group leads to its first page and lists the rest beneath. */
export const PAGE_GROUPS = [
	{ label: 'Accounts', pages: [{ path: 'accounts', label: 'Accounts' }] },
	{ label: 'Expenses', pages: [{ path: 'expenses', label: 'Expenses' }] },
	{
		label: 'Transactions',
		pages: [
			{ path: 'transactions', label: 'Transactions' },
			{ path: 'postings', label: 'Postings' },
		],
	},
	{
		label: 'Files',
		pages: [
			{ path: 'files', label: 'Files' },
			{ path: 'import', label: 'Import' },
			{ path: 'refine', label: 'Refine' },
		],
	},
];
