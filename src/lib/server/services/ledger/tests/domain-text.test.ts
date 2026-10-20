import { describe, expect, it } from 'vitest';
import { accountText, clean, filling } from '#services/ledger/domain/text.ts';

const axis = (i: number) => Float32Array.from({ length: 4 }, (_, d) => (d === i ? 1 : 0));

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

describe('filling', () => {
	it('embeds each description once, by its words', () => {
		const f = filling([
			{ id: 'a', description: 'UPI/123456/SWIGGY' },
			{ id: 'b', description: 'UPI/654321/SWIGGY' },
		]);
		expect(f.texts).toEqual(['swiggy']);
		expect(f.fill([axis(1)])).toEqual([
			{ id: 'a', vector: axis(1) },
			{ id: 'b', vector: axis(1) },
		]);
	});

	it('marks a description with no words done, with no vector', () => {
		const f = filling([{ id: 'a', description: 'UPI/123456789/' }]);
		expect(f.texts).toEqual([]);
		expect(f.fill([])).toEqual([{ id: 'a', vector: null }]);
	});
});
