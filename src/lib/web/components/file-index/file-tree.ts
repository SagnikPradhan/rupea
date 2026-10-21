/** A folder's path ends in `/`; a file's is its key. */
export type TreeRow<F> = { path: string; name: string; depth: number; file: F | null };

/** Folders, then the files in them, each before what it holds; a collapsed folder hides all of it. */
export const treeRows = <F extends { key: string }>(files: F[], collapsed: string[]) => {
	const opened = new Set<string>();
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
			const unseen = folders.filter((f) => !opened.has(f.path));
			for (const f of unseen) opened.add(f.path);

			return [...unseen, { path: file.key, name: parts.at(-1) ?? '', depth: folders.length, file }];
		});

	return rows.filter((r) => !collapsed.some((c) => r.path !== c && r.path.startsWith(c)));
};

/** The keys of the files under a folder. */
export const keysUnder = (l: { key: string }[], d: string) =>
	l.filter((f) => f.key.startsWith(d)).map((f) => f.key);

/** Where a file lands when moved into a folder, keeping its name; an empty folder is the top. */
export const movedTo = (key: string, folder: string) => {
	const into = folder.trim().replace(/^\/+|\/+$/g, '');
	const name = key.slice(key.lastIndexOf('/') + 1);
	return into === '' ? name : `${into}/${name}`;
};

// Folders come before files beside them, and names sort as people read them.
const byTree = (a: string, b: string) => {
	const x = a.split('/');
	const y = b.split('/');
	const i = x.findIndex((s, n) => s !== y[n]);
	const fileA = i === x.length - 1;
	const fileB = i === y.length - 1;

	if (fileA !== fileB) return fileA ? 1 : -1;
	return (x[i] ?? '').localeCompare(y[i] ?? '', undefined, { numeric: true });
};
