/** A fake `EditorApi` over an in-memory disk, for the editor's tests. */
import { vi } from 'vitest';
import type { RupeeError } from '#lib/server/shared/error.ts';
import type { Response } from '#lib/server/shared/result.ts';
import type { EditorApi, EditorFile } from './editor.svelte.ts';

export const succeed = <T>(d: T): Response<T> => ({ ok: true, data: d, errors: [] });

export const fail = <T>(...errors: RupeeError[]): Response<T> => ({
	ok: false,
	data: null,
	errors,
});

export const conflict: RupeeError = {
	type: 'StorageConflict',
	key: 'a.rupee',
	expected: '1',
	actual: '2',
	cause: [],
};

export const parseError: RupeeError = {
	type: 'ParseInvalidPosting',
	location: 'a.rupee:2',
	cause: [],
};

/** Files by key; versions count up with every write. */
export const fakeApi = (initial: Record<string, string>) => {
	const disk = new Map(Object.entries(initial).map(([key, content]) => [key, { content, n: 1 }]));
	const file = (key: string): EditorFile | undefined => {
		const stored = disk.get(key);
		return stored && { key, content: stored.content, version: String(stored.n) };
	};
	const api = {
		read: vi.fn(async (key: string) => {
			const found = file(key);
			return found ? succeed(found) : fail<EditorFile>();
		}),
		check: vi.fn(async ({ content }: { key: string; content: string }) =>
			content.includes('bad') ? { ...fail<unknown[]>(parseError), data: [] } : succeed([]),
		),
		save: vi.fn(async (input: EditorFile) => {
			const stored = disk.get(input.key);
			if (stored === undefined || String(stored.n) !== input.version)
				return fail<EditorFile>(conflict);
			disk.set(input.key, { content: input.content, n: stored.n + 1 });
			return succeed(file(input.key)!);
		}),
		create: vi.fn(async ({ key, content }: { key: string; content: string }) => {
			disk.set(key, { content, n: 1 });
			return succeed(file(key)!);
		}),
		rename: vi.fn(async ({ key, to }: { key: string; to: string }) => {
			disk.set(to, disk.get(key)!);
			disk.delete(key);
			return succeed(file(to)!);
		}),
		remove: vi.fn(async (key: string) => {
			disk.delete(key);
			return succeed(undefined);
		}),
	} satisfies EditorApi;
	/** Change a file behind the editor's back. */
	const touch = (k: string, c: string) => disk.set(k, { content: c, n: (disk.get(k)?.n ?? 0) + 1 });
	return { api, touch, disk };
};
