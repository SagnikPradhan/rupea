import { describe, expect, it } from 'vitest';
import { chunks } from '#lib/server/shared/arrays.ts';

describe('chunking', () => {
	it('splits into chunks of at most the given size, in order', () => {
		expect(chunks(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
	});

	it('makes no chunk for nothing', () => {
		expect(chunks([], 32)).toEqual([]);
	});
});
