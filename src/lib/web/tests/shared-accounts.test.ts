import { describe, expect, it } from 'vitest';
import { isUnder } from '#lib/web/shared/accounts.ts';

describe('isUnder', () => {
	it('takes an account and those under it, whatever their case, and every account under none', () => {
		expect(isUnder('assets:bank', 'Assets')).toBe(true);
		expect(isUnder('Assets', 'Assets')).toBe(true);
		expect(isUnder('Assets2', 'Assets')).toBe(false);
		expect(isUnder('Liabilities', null)).toBe(true);
	});
});
