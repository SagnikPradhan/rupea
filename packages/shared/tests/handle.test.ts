import { describe, expect, it } from 'vitest';
import { Handle, isHandle } from '@rupea/shared/handle.ts';
import * as v from 'valibot';

describe('a ledger handle', () => {
	it('is lowercase words joined by single hyphens', () => {
		expect(['quiet-heron', 'q2', 'a-b-c'].every(isHandle)).toBe(true);
		expect(['', 'Quiet', 'quiet--heron', '-heron', 'heron-', 'a/b', '..'].some(isHandle)).toBe(
			false,
		);
	});

	it('is refused by its schema with a reason', () => {
		expect(v.safeParse(Handle, 'Quiet').issues?.[0]?.message).toBe('Not a ledger handle.');
	});
});
