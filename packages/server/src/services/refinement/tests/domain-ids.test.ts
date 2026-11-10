import { describe, expect, it } from 'vitest';
import { groupId } from '#services/refinement/domain/ids.ts';

describe('naming a group', () => {
	it('uses the date, the first word naming the merchant, an adjective and an animal', () => {
		expect(groupId({ date: '2026-10-03', description: 'UPI/DR/4123/SWIGGY/YESB' })).toMatch(
			/^2026-10-03-swiggy-[a-z]+-[a-z]+$/,
		);
	});

	it('leaves the merchant out when no word names it', () => {
		expect(groupId({ date: '2026-10-03', description: 'NEFT 4412 TO' })).toMatch(
			/^2026-10-03-[a-z]+-[a-z]+$/,
		);
	});
});
