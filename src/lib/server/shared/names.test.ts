import { describe, expect, it } from 'vitest';
import { isHandle, petName } from './names';

describe('names', () => {
	it('makes a pet name of two words that is a handle', () => {
		const name = petName();

		expect(name).toMatch(/^[a-z]+-[a-z]+$/);
		expect(isHandle(name)).toBe(true);
	});

	it('accepts lowercase words joined by single hyphens as handles', () => {
		expect(['quiet-heron', 'q2', 'a-b-c'].every(isHandle)).toBe(true);
		expect(['', 'Quiet', 'quiet--heron', '-heron', 'heron-', 'a/b', '..'].some(isHandle)).toBe(
			false,
		);
	});
});
