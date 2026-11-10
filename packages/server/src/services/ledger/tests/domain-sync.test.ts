import { describe, expect, it } from 'vitest';
import { INDEXER, plan } from '#services/ledger/domain/sync.ts';

describe('planning a sync', () => {
	it('reindexes files that are new or at another version', () => {
		const stored = [
			{ key: 'a', version: '1' },
			{ key: 'b', version: '2' },
			{ key: 'c', version: '1' },
		];
		const indexed = [
			{ key: 'a', version: '1', indexer: INDEXER },
			{ key: 'b', version: '1', indexer: INDEXER },
		];
		expect(plan(stored, indexed)).toEqual({ changed: ['b', 'c'], gone: [] });
	});

	it('reindexes files an older indexer indexed, though their version is the same', () => {
		const stored = [
			{ key: 'a', version: '1' },
			{ key: 'b', version: '1' },
		];
		const indexed = [
			{ key: 'a', version: '1', indexer: INDEXER - 1 },
			{ key: 'b', version: '1', indexer: INDEXER },
		];
		expect(plan(stored, indexed)).toEqual({ changed: ['a'], gone: [] });
	});

	it('drops files no longer stored', () => {
		expect(plan([], [{ key: 'a', version: '1', indexer: INDEXER }])).toEqual({
			changed: [],
			gone: ['a'],
		});
	});
});
