import { describe, expect, it } from 'vitest';
import { accountText, clean } from '#services/ledger/domain/text.ts';

describe('clean', () => {
	it('lowercases and drops references and payment-rail words', () => {
		expect(clean('UPI/412398123/SWIGGY/okaxis')).toBe('swiggy okaxis');
		expect(clean('NEFT-0012345678-ACME PAYROLL')).toBe('acme payroll');
	});

	it('keeps short numbers, which can be part of a name', () => {
		expect(clean('POS 7-ELEVEN 042')).toBe('7 eleven 042');
	});

	it('leaves nothing for a description that is only noise', () => {
		expect(clean('UPI/412398123/')).toBe('');
	});
});

describe('accountText', () => {
	it('reads an account as words', () => {
		expect(accountText('Expenses:Eating-Out')).toBe('expenses eating out');
	});
});
