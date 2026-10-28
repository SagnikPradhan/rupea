import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, vi } from 'vitest';
import { untilSeen } from '#tests/shared/watch.ts';
import { it } from '#tests/shared/vitest.ts';
import {
	byUser,
	findText,
	readText,
	scoped,
	validateKey,
	writeNumbered,
	writeText,
	type Change,
	type Storage,
} from '#lib/server/shared/storage/storage.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';

const text = (s: string) => new TextEncoder().encode(s);

const keys = async (s: Storage, prefix?: string) => {
	const listed = await s.list(prefix);
	return listed.isOk() ? listed.value.map((e) => e.key).sort() : listed;
};

/** Collects what the storage reports changed under prefix while act runs, until it reports key. */
const watched = async (s: Storage, key: string, act: () => Promise<void>, prefix = '') => {
	const probe = [prefix, 'probe'].filter((k) => k !== '').join('/');
	const controller = new AbortController();
	const seen: string[] = [];
	void (async () => {
		for await (const k of s.watch(controller.signal, prefix)) seen.push(k);
	})();

	await untilSeen(
		() => s.write({ key: probe, content: text('') }),
		() => seen.includes(probe),
	);
	await act();
	await vi.waitFor(() => expect(seen).toContain(key));
	controller.abort();
	return seen.filter((k) => k !== probe);
};

describe('storage keys', () => {
	it.each(['a.rupea', 'bank/2026/hdfc.rupea', '.hidden'])('accepts %j', (k) => {
		expect(validateKey(k)).toEqual(ok(k));
	});

	it.each(['', '/a', 'a/', 'a//b', '.', '..', '../a', 'a/../b', 'a\\b'])('rejects %j', (key) => {
		expect(validateKey(key)).toEqual(err({ type: 'StorageInvalidKey', key }));
	});
});

describe('local storage', () => {
	it('writes and reads back, creating directories', async ({ storage }) => {
		const written = await storage.write({
			key: 'bank/a.rupea',
			content: text('hello'),
		});
		expect(written).toMatchObject(ok({ key: 'bank/a.rupea', size: 5 }));
		const read = await storage.read('bank/a.rupea');
		expect(read.isOk() && new TextDecoder().decode(read.value.content)).toBe('hello');
		expect(read.isOk() && read.value.entry.version).toBe(written.isOk() && written.value.version);
	});

	it('gives content of the same size written again a new version', async ({ storage }) => {
		const first = await storage.write({ key: 'a', content: text('1') });
		const second = await storage.write({ key: 'a', content: text('2') });
		const listed = await storage.list();

		expect(first.isOk() && second.isOk() && first.value.version !== second.value.version).toBe(
			true,
		);
		expect(listed.isOk() && listed.value[0]?.version).toBe(second.isOk() && second.value.version);
	});

	it('reports a missing key', async ({ storage }) => {
		expect(await storage.read('missing')).toEqual(err({ type: 'StorageNotFound', key: 'missing' }));
	});

	it('lists every file under a prefix, recursively', async ({ storage }) => {
		await storage.write({ key: 'a/x', content: text('') });
		await storage.write({ key: 'a/b/y', content: text('') });
		await storage.write({ key: 'c/z', content: text('') });
		expect(await keys(storage)).toEqual(['a/b/y', 'a/x', 'c/z']);
		expect(await keys(storage, 'a/')).toEqual(['a/b/y', 'a/x']);
		expect(await keys(storage, 'missing/')).toEqual([]);
	});

	it('creates only if missing when no version is expected', async ({ storage }) => {
		const created = await storage.write({
			key: 'a',
			content: text('1'),
			ifVersion: null,
		});
		expect(created.isOk()).toBe(true);
		expect(await storage.write({ key: 'a', content: text('2'), ifVersion: null })).toMatchObject({
			error: { type: 'StorageConflict', key: 'a', expected: null },
		});
	});

	it('refuses a write against a stale version', async ({ storage }) => {
		const first = await storage.write({ key: 'a', content: text('1') });
		if (first.isErr()) throw new Error('write failed');
		const second = await storage.write({
			key: 'a',
			content: text('2'),
			ifVersion: first.value.version,
		});
		expect(second.isOk()).toBe(true);

		const stale = await storage.write({
			key: 'a',
			content: text('3'),
			ifVersion: first.value.version,
		});
		expect(stale).toMatchObject({
			error: {
				type: 'StorageConflict',
				expected: first.value.version,
				actual: second.isOk() && second.value.version,
			},
		});
	});

	it('lets only one of two racing conditional writes through', async ({ storage }) => {
		const first = await storage.write({ key: 'a', content: text('1') });
		if (first.isErr()) throw new Error('write failed');
		const { version } = first.value;
		const results = await Promise.all([
			storage.write({ key: 'a', content: text('2'), ifVersion: version }),
			storage.write({ key: 'a', content: text('3'), ifVersion: version }),
		]);
		expect(results.filter((r) => r.isOk())).toHaveLength(1);
	});

	it('renames, refusing to overwrite', async ({ storage }) => {
		await storage.write({ key: 'a', content: text('1') });
		await storage.write({ key: 'b', content: text('2') });
		expect(await storage.rename('a', 'b')).toMatchObject({
			error: { type: 'StorageConflict', key: 'b' },
		});
		expect(await storage.rename('a', 'dir/c')).toMatchObject(ok({ key: 'dir/c' }));
		expect(await keys(storage)).toEqual(['b', 'dir/c']);
		expect(await storage.rename('missing', 'd')).toMatchObject({
			error: { type: 'StorageNotFound', key: 'missing' },
		});
	});

	it('deletes, and deleting a missing key is not an error', async ({ storage }) => {
		await storage.write({ key: 'a', content: text('') });
		expect(await storage.delete('a')).toEqual(ok(undefined));
		expect(await storage.delete('a')).toEqual(ok(undefined));
		expect(await keys(storage)).toEqual([]);
	});

	it('refuses invalid keys', async ({ storage }) => {
		expect(await storage.write({ key: '../escape', content: text('') })).toMatchObject({
			error: { type: 'StorageInvalidKey' },
		});
	});

	it('skips dangling symlinks when listing', async ({ root, storage }) => {
		await storage.write({ key: 'a', content: text('') });
		await symlink('missing', join(root, 'b'));
		expect(await keys(storage)).toEqual(['a']);
	});
});

describe('watching storage', () => {
	it('reports a file written from outside', async ({ root, storage }) => {
		const seen = await watched(storage, 'bank/a.rupea', async () => {
			await mkdir(join(root, 'bank'));
			await writeFile(join(root, 'bank', 'a.rupea'), 'hello');
		});
		expect(seen).toContain('bank/a.rupea');
	});

	it('reports its own writes without their temporary files', async ({ storage }) => {
		const seen = await watched(storage, 'a.rupea', async () => {
			await storage.write({ key: 'a.rupea', content: text('1') });
		});
		expect(seen).toContain('a.rupea');
		expect(seen.filter((k) => k.startsWith('.tmp'))).toEqual([]);
	});

	it('reports only keys under a prefix, with the prefix', async ({ storage }) => {
		const seen = await watched(
			storage,
			'users/a.rupea',
			async () => {
				await storage.write({ key: 'postgres/b', content: text('') });
				await storage.write({ key: 'users/a.rupea', content: text('') });
			},
			'users',
		);
		expect(new Set(seen)).toEqual(new Set(['users/a.rupea']));
	});

	it('stops when the signal aborts while it reports', async ({ storage }) => {
		const controller = new AbortController();
		const seen: string[] = [];
		const watching = (async () => {
			for await (const k of storage.watch(controller.signal)) seen.push(k);
		})();

		await untilSeen(
			() => storage.write({ key: 'a.rupea', content: text('') }),
			() => seen.includes('a.rupea'),
		);
		controller.abort();
		await watching;
	});

	it('stops when the signal aborts', async ({ storage }) => {
		const controller = new AbortController();
		const keys = storage.watch(controller.signal)[Symbol.asyncIterator]();
		const next = keys.next();

		controller.abort();
		expect(await next).toEqual({ done: true, value: undefined });
	});
});

describe('writing a numbered key', () => {
	it('numbers a taken name from 02, keeping its extension', async ({ storage }) => {
		const written = [];
		for (const content of ['a', 'b', 'c'])
			written.push(await writeNumbered(storage, 'day/hdfc.pdf', text(content)));

		expect(written.map((w) => w.isOk() && w.value.key)).toEqual([
			'day/hdfc.pdf',
			'day/hdfc-02.pdf',
			'day/hdfc-03.pdf',
		]);
	});

	it('keeps a numbered key that holds this content already', async ({ storage }) => {
		await writeNumbered(storage, 'day/hdfc.pdf', text('a'));
		await writeNumbered(storage, 'day/hdfc.pdf', text('b'));
		const again = await writeNumbered(storage, 'day/hdfc.pdf', text('b'));

		expect(again).toMatchObject(ok({ key: 'day/hdfc-02.pdf' }));
		expect(await keys(storage)).toEqual(['day/hdfc-02.pdf', 'day/hdfc.pdf']);
	});
});

describe('scoped storage', () => {
	it('confines keys to its prefix and hides the prefix', async ({ storage }) => {
		const one = scoped(storage, 'ledgers/one');
		const two = scoped(storage, 'ledgers/two');
		await one.write({ key: 'a.rupea', content: text('1') });
		await two.write({ key: 'b.rupea', content: text('2') });

		expect(await keys(one)).toEqual(['a.rupea']);
		expect(await keys(two)).toEqual(['b.rupea']);
		expect(await keys(storage)).toEqual(['ledgers/one/a.rupea', 'ledgers/two/b.rupea']);
		expect(await one.read('b.rupea')).toMatchObject({ error: { type: 'StorageNotFound' } });
	});

	it('cannot be escaped with ..', async ({ storage }) => {
		const one = scoped(storage, 'ledgers/one');
		expect(await one.read('../two/b.rupea')).toMatchObject({
			error: { type: 'StorageInvalidKey', key: '../two/b.rupea' },
		});
	});

	it('watches only its own keys, without the prefix', async ({ storage }) => {
		const one = scoped(storage, 'ledgers/one');
		const seen = await watched(one, 'a.rupea', async () => {
			await storage.write({ key: 'ledgers/two/b.rupea', content: text('') });
			await storage.write({ key: 'ledgers/one/a.rupea', content: text('') });
		});
		expect(new Set(seen)).toEqual(new Set(['a.rupea']));
	});

	it('does not see a sibling prefix that shares its name', async ({ storage }) => {
		await storage.write({ key: 'ledgers/one2/a', content: text('') });
		expect(await keys(scoped(storage, 'ledgers/one'))).toEqual([]);
	});
});

describe('storage by user', () => {
	it("opens each user's own folder", async ({ storage }) => {
		await byUser(storage)
			.open('u1')
			.write({ key: 'a.rupea', content: text('') });
		expect(await keys(storage)).toEqual(['users/u1/a.rupea']);
	});

	it('reports whose storage changed', async ({ storage }) => {
		await storage.write({ key: 'users/u1/a.rupea', content: text('') });
		const controller = new AbortController();
		const seen: Change[] = [];
		void (async () => {
			for await (const c of byUser(storage).watch(controller.signal)) seen.push(c);
		})();

		await untilSeen(
			() => storage.write({ key: 'users/u1/a.rupea', content: text('') }),
			() => seen.some((c) => c.user === 'u1' && c.key === 'a.rupea'),
		);
		controller.abort();
	});
});

describe('text files', () => {
	it('are written and read back as text', async ({ storage }) => {
		await writeText(storage, { key: 'a.rupea', content: 'hello' });
		expect(await readText(storage, 'a.rupea')).toMatchObject(
			ok({ key: 'a.rupea', content: 'hello' }),
		);
	});

	it('cannot be read when they are not UTF-8', async ({ storage }) => {
		await storage.write({ key: 'bad.rupea', content: new Uint8Array([0xff, 0xfe]) });
		expect(await readText(storage, 'bad.rupea')).toMatchObject({
			error: { type: 'CannotReadFile', path: 'bad.rupea', reason: 'not valid UTF-8' },
		});
	});

	it('cannot be read when missing', async ({ storage }) => {
		expect(await readText(storage, 'missing.rupea')).toMatchObject({
			error: {
				type: 'CannotReadFile',
				path: 'missing.rupea',
				cause: [{ type: 'StorageNotFound' }],
			},
		});
	});

	it('are found as nothing when missing, but still fail when unreadable', async ({ storage }) => {
		await storage.write({ key: 'bad.rupea', content: new Uint8Array([0xff, 0xfe]) });

		expect(await findText(storage, 'missing.rupea')).toEqual(ok(null));
		expect(await findText(storage, 'bad.rupea')).toMatchObject({
			error: { type: 'CannotReadFile', reason: 'not valid UTF-8' },
		});
	});
});
