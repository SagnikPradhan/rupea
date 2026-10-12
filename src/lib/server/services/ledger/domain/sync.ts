import type { RupeeError } from '#lib/server/shared/result/error.ts';

export type FileVersion = { key: string; version: string | null };

export type SyncPlan = { changed: string[]; gone: string[] };

export const plan = (stored: FileVersion[], indexed: FileVersion[]): SyncPlan => {
	const versions = new Map(indexed.map((f) => [f.key, f.version]));
	const present = new Set(stored.map((f) => f.key));
	return {
		changed: stored.filter((f) => versions.get(f.key) !== f.version).map((f) => f.key),
		gone: indexed.filter((f) => !present.has(f.key)).map((f) => f.key),
	};
};

// A file with errors is indexed without a version, so every sync parses it
// again and reports them until they are fixed.
export const indexedVersion = (v: string, f: RupeeError[]): string | null =>
	f.length === 0 ? v : null;
