import { memo } from '#lib/server/shared/memo.ts';
import { describe, expect, it, vi } from 'vitest';

describe('a memo', () => {
	it('calls the function once for each argument', () => {
		const fn = vi.fn((n: { a: number }) => n.a * 2);
		const double = memo({ fn, size: 10 });

		expect([double({ a: 1 }), double({ a: 1 }), double({ a: 2 })]).toEqual([2, 2, 4]);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('forgets everything once it is full', () => {
		const fn = vi.fn((n: number) => n);
		const same = memo({ fn, size: 2 });

		[1, 2, 1, 3, 1].forEach(same);
		expect(fn.mock.calls.map(([n]) => n)).toEqual([1, 2, 3, 1]);
	});
});
