import { describe, expect, it } from 'vitest';
import { eventId } from './ids';

describe('naming an event', () => {
	it('uses the date, the first word naming the merchant, an adjective and an animal', () => {
		expect(eventId({ date: '2026-10-03', description: 'UPI/DR/4123/SWIGGY/YESB' })).toMatch(
			/^2026-10-03-swiggy-[a-z]+-[a-z]+$/,
		);
	});

	it('leaves the merchant out when no word names it', () => {
		expect(eventId({ date: '2026-10-03', description: 'NEFT 4412 TO' })).toMatch(
			/^2026-10-03-[a-z]+-[a-z]+$/,
		);
	});
});
