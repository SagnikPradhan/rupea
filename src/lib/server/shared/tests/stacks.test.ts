import { describe, expect, it } from 'vitest';
import { drain, takeWhile } from '#lib/server/shared/stacks.ts';

describe('draining a stack', () => {
	it('lets the loop take items the drain then skips', () => {
		const stack = [1, 2, 3, 4];
		const seen = Array.from(drain(stack), (n) => [n, ...takeWhile(stack, (m) => m % 2 === 0)]);

		expect(seen).toEqual([
			[1, 2],
			[3, 4],
		]);
		expect(stack).toEqual([]);
	});
});

describe('taking from a stack', () => {
	it('removes the leading items that pass and leaves the rest', () => {
		const stack = [2, 4, 5, 6];

		expect(takeWhile(stack, (n) => n % 2 === 0)).toEqual([2, 4]);
		expect(stack).toEqual([5, 6]);
	});

	it('takes everything when every item passes', () => {
		const stack = [2, 4];

		expect(takeWhile(stack, (n) => n % 2 === 0)).toEqual([2, 4]);
		expect(stack).toEqual([]);
	});
});
