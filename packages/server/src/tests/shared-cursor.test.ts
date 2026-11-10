import { describe, expect, it } from 'vitest';
import { cursorOf, drain, putBack, takeWhile } from '#lib/server/shared/cursor.ts';

describe('draining a cursor', () => {
	it('lets the loop take items the drain then skips', () => {
		const cursor = cursorOf([1, 2, 3, 4]);
		const seen = Array.from(drain(cursor), (n) => [n, ...takeWhile(cursor, (m) => m % 2 === 0)]);

		expect(seen).toEqual([
			[1, 2],
			[3, 4],
		]);
		expect(cursor.at).toBe(4);
	});
});

describe('taking from a cursor', () => {
	it('takes the items that pass and stops at the first that does not', () => {
		const cursor = cursorOf([2, 4, 5, 6]);

		expect(takeWhile(cursor, (n) => n % 2 === 0)).toEqual([2, 4]);
		expect(takeWhile(cursor, () => true)).toEqual([5, 6]);
	});

	it('takes everything when every item passes', () => {
		const cursor = cursorOf([2, 4]);

		expect(takeWhile(cursor, (n) => n % 2 === 0)).toEqual([2, 4]);
		expect(takeWhile(cursor, () => true)).toEqual([]);
	});

	it('reads what was put back again', () => {
		const cursor = cursorOf([1, 2, 3]);
		takeWhile(cursor, () => true);
		putBack(cursor, 2);

		expect(takeWhile(cursor, () => true)).toEqual([2, 3]);
	});
});
