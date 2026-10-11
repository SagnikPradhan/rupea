import { describe, expect, it } from 'vitest';
import { isHandle, petName } from './names';

describe('names', () => {
	it('makes a pet name of an adjective and an animal', () => {
		expect(petName((w) => w[0] ?? '')).toBe('able-aardvark');
	});

	it('makes only handles', () => {
		expect(isHandle(petName((w) => w.at(-1) ?? ''))).toBe(true);
	});

	it('accepts lowercase words joined by single hyphens as handles', () => {
		expect(['quiet-heron', 'q2', 'a-b-c'].every(isHandle)).toBe(true);
		expect(['', 'Quiet', 'quiet--heron', '-heron', 'heron-', 'a/b', '..'].some(isHandle)).toBe(
			false,
		);
	});
});
