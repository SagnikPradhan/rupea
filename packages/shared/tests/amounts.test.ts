import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { Amount, AmountOut, parseAmount } from '@rupea/shared/amounts.ts';

describe('an amount', () => {
	it('reads a decimal string without losing a digit', () => {
		expect(v.parse(Amount, '1250.5')).toBe(1250_5000000000n);
		expect(v.parse(Amount, '-0.0000000001')).toBe(-1n);
	});

	it('refuses what a decimal string is not', () => {
		const refused = ['1,250.50', '₹10', '1.00000000001', '', '1e3'];
		expect(refused.filter((text) => v.safeParse(Amount, text).success)).toEqual([]);
	});

	it('holds 28 whole digits, as many as the database column', () => {
		const most = `${'9'.repeat(28)}.9999999999`;
		expect(v.parse(Amount, most)).toBe(10n ** 38n - 1n);
		expect(v.parse(Amount, `-${most}`)).toBe(-(10n ** 38n) + 1n);
		expect(v.safeParse(Amount, `1${'0'.repeat(28)}`).success).toBe(false);
		expect(parseAmount(`1${'0'.repeat(28)}`)).toBeNull();
	});

	it('reads the same decimals on the wire as parseAmount does', () => {
		expect(v.parse(Amount, '+5.5')).toBe(parseAmount('+5.5'));
		expect(parseAmount('+5.5')).toBe(5_5000000000n);
		expect(parseAmount('₹1,250.50')).toBe(1250_5000000000n);
	});

	it('goes out as the string it reads back', () => {
		const text = v.parse(AmountOut, -2000_5000000000n);
		expect(text).toBe('-2000.50');
		expect(v.parse(Amount, text)).toBe(-2000_5000000000n);
		expect(v.safeParse(AmountOut, '1.00').success).toBe(false);
	});
});
