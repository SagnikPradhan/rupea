import { vi } from 'vitest';
import type { RupeaError } from '#lib/server/shared/result/error.ts';
import type { Reply } from '#lib/server/shared/result/reply.ts';
import type { EditorApi, EditorFile } from '#lib/web/components/file-editor/file-editor.svelte.ts';

export const succeed = <T>(d: T): Reply<T> => ({ ok: true, data: d, errors: [] });

export const fail = <T>(...errors: RupeaError[]): Reply<T> => ({
	ok: false,
	data: null,
	errors,
});

export const conflict: RupeaError = {
	type: 'StorageConflict',
	key: 'a.rupea',
	expected: '1',
	actual: '2',
};

export const parseError: RupeaError = {
	type: 'ParseInvalidPosting',
	location: 'a.rupea:2',
};

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
		format: vi.fn(async (c: string) => succeed(c.trim())),
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
			return succeed(key);
		}),
	} satisfies EditorApi;
	const touch = (k: string, c: string) => disk.set(k, { content: c, n: (disk.get(k)?.n ?? 0) + 1 });
	return { api, touch, disk };
};
