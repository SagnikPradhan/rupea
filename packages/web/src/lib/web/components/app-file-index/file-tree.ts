/** A folder's path ends in `/`; a file's is its key. */
export type TreeRow<F> = { path: string; name: string; depth: number; file: F | null };

export const treeRows = <F extends { key: string }>(files: F[], toggled: string[]) => {
	const seen = new Set<string>();
	const rows = files
		.toSorted((a, b) => byTree(a.key, b.key))
		.flatMap((file): TreeRow<F>[] => {
			const parts = file.key.split('/');
			const folders = parts.slice(0, -1).map((name, i) => ({
				path: `${parts.slice(0, i + 1).join('/')}/`,
				name,
				depth: i,
				file: null,
			}));
			const unseen = folders.filter((f) => !seen.has(f.path));
			for (const f of unseen) seen.add(f.path);

			return [...unseen, { path: file.key, name: parts.at(-1) ?? '', depth: folders.length, file }];
		});

	return rows.filter((r) => foldersAbove(r).every((f) => isOpen(f, toggled)));
};

/** Top-level folders start open and deeper ones closed; a toggle flips either. */
export const isOpen = (d: string, t: string[]) => (d.split('/').length === 2) !== t.includes(d);

export const countLabel = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

export const foldersOf = (key: string) =>
	key
		.split('/')
		.slice(0, -1)
		.map((_, i, p) => `${p.slice(0, i + 1).join('/')}/`);

export const keysUnder = (l: { key: string }[], d: string) =>
	l.filter((f) => f.key.startsWith(d)).map((f) => f.key);

export const movedTo = (key: string, folder: string) => {
	const into = folder
		.split('/')
		.map((p) => p.trim())
		.filter(Boolean)
		.join('/');
	const name = key.slice(key.lastIndexOf('/') + 1);
	return into === '' ? name : `${into}/${name}`;
};

const foldersAbove = (row: { path: string; depth: number }) =>
	row.path
		.split('/')
		.slice(0, row.depth)
		.map((_, i, p) => `${p.slice(0, i + 1).join('/')}/`);

const byTree = (a: string, b: string) => {
	const x = a.split('/');
	const y = b.split('/');
	const i = x.findIndex((s, n) => s !== y[n]);
	const fileA = i === x.length - 1;
	const fileB = i === y.length - 1;

	if (fileA !== fileB) return fileA ? 1 : -1;
	return (x[i] ?? '').localeCompare(y[i] ?? '', undefined, { numeric: true });
};
