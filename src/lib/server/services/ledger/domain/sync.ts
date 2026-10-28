type FileVersion = { key: string; version: string };

export type SyncPlan = { changed: string[]; gone: string[] };

/** Which stored files to index again, as they are new or at another version, and which indexed files are gone. */
export const plan = (stored: FileVersion[], indexed: FileVersion[]): SyncPlan => {
	const versions = new Map(indexed.map((f) => [f.key, f.version]));
	const present = new Set(stored.map((f) => f.key));
	return {
		changed: stored.filter((f) => versions.get(f.key) !== f.version).map((f) => f.key),
		gone: indexed.filter((f) => !present.has(f.key)).map((f) => f.key),
	};
};
