import { describe, expect, it } from 'vitest';
import { batches } from '#lib/server/shared/batches.ts';

describe('batching', () => {
	it('splits into batches of at most the given size, in order', () => {
		expect(batches(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
	});

	it('makes no batch for nothing', () => {
		expect(batches([], 32)).toEqual([]);
	});
});
