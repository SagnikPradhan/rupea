import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect } from 'vitest';
import { it } from '#tests/shared/vitest.ts';
import {
	scoped,
	validateKey,
	writeNumbered,
	type Storage,
} from '#lib/server/shared/storage/storage.ts';
import { err, ok } from '#lib/server/shared/result/result.ts';

const text = (s: string) => new TextEncoder().encode(s);

const keys = async (s: Storage, prefix?: string) => {
	const listed = await s.list(prefix);
	return listed.isOk() ? listed.value.map((e) => e.key).sort() : listed;
};

describe('storage keys', () => {
	it.each(['a.rupee', 'bank/2026/hdfc.rupee', '.hidden'])('accepts %j', (k) => {
		expect(validateKey(k)).toEqual(ok(k));
	});

	it.each(['', '/a', 'a/', 'a//b', '.', '..', '../a', 'a/../b', 'a\\b'])('rejects %j', (key) => {
		expect(validateKey(key)).toEqual(err({ type: 'StorageInvalidKey', key }));
	});
});

describe('local storage', () => {
	it('writes and reads back, creating directories', async ({ storage }) => {
		const written = await storage.write({
			key: 'bank/a.rupee',
			content: text('hello'),
		});
		expect(written).toMatchObject(ok({ key: 'bank/a.rupee', size: 5 }));
		const read = await storage.read('bank/a.rupee');
		expect(read.isOk() && new TextDecoder().decode(read.value.content)).toBe('hello');
		expect(read.isOk() && read.value.entry.version).toBe(written.isOk() && written.value.version);
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
		await one.write({ key: 'a.rupee', content: text('1') });
		await two.write({ key: 'b.rupee', content: text('2') });

		expect(await keys(one)).toEqual(['a.rupee']);
		expect(await keys(two)).toEqual(['b.rupee']);
		expect(await keys(storage)).toEqual(['ledgers/one/a.rupee', 'ledgers/two/b.rupee']);
		expect(await one.read('b.rupee')).toMatchObject({ error: { type: 'StorageNotFound' } });
	});

	it('cannot be escaped with ..', async ({ storage }) => {
		const one = scoped(storage, 'ledgers/one');
		expect(await one.read('../two/b.rupee')).toMatchObject({
			error: { type: 'StorageInvalidKey', key: '../two/b.rupee' },
		});
	});

	it('does not see a sibling prefix that shares its name', async ({ storage }) => {
		await storage.write({ key: 'ledgers/one2/a', content: text('') });
		expect(await keys(scoped(storage, 'ledgers/one'))).toEqual([]);
	});
});
