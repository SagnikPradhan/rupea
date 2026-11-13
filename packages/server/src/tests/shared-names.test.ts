import { describe, expect, it } from 'vitest';
import { isHandle } from '@rupea/shared/text.ts';
import { petName } from '#lib/server/shared/names.ts';

describe('names', () => {
	it('makes a pet name of two words that is a handle', () => {
		const name = petName();

		expect(name).toMatch(/^[a-z]+-[a-z]+$/);
		expect(isHandle(name)).toBe(true);
	});
});
