import { describe, expect, it } from 'vitest';
import { described } from '#services/ledger/domain/merchants.ts';

describe('describing merchants', () => {
	it('adds what a known merchant sells', () => {
		expect(described('ovhcloud')).toBe('ovhcloud server hosting cloud');
	});

	it('finds a merchant in a phrase or inside a longer word', () => {
		expect(described('tata play')).toBe('tata play television dth');
		expect(described('razorpayzomato')).toBe('razorpayzomato food delivery restaurants');
	});

	it('leaves words that name no known merchant alone', () => {
		expect(described('sharma stores')).toBe('sharma stores');
		expect(described('')).toBe('');
	});
});
