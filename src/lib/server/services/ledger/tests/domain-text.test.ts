import { describe, expect, it } from 'vitest';
import { accountText, clean, filled, wordsOf } from '#services/ledger/domain/text.ts';

const axis = (i: number) => Float32Array.from({ length: 4 }, (_, d) => (d === i ? 1 : 0));

describe('clean', () => {
	it('lowercases and drops references and payment-rail words', () => {
		expect(clean('UPI/412398123/SWIGGY/okaxis')).toBe('swiggy');
		expect(clean('NEFT-0012345678-ACME PAYROLL')).toBe('acme payroll');
	});

	it('drops UPI handles, IFSC codes and references around the payee', () => {
		const upi = 'UPI-BLINKIT-BLINKIT.PAYU@HDFCBANK-HDFC0000001-123456789012-UPI';
		expect(clean(upi)).toBe('blinkit');
		expect(clean('TO TRANSFER-UPI/DR/123456789012/Swiggy/ICIC/swiggystor/UPI--')).toBe(
			'swiggy swiggystor',
		);
	});

	it('drops masked card numbers and references mixing letters and digits', () => {
		expect(clean('POS 400000XXXXXX0000 AMAZON PAY INDIA')).toBe('amazon india');
		expect(clean('TO TRANSFER-UPI/DR/123456789012/SHARMA/PYTM/paytmqr123/UPI--')).toBe('sharma');
	});

	it('drops gateway prefixes, company suffixes and web addresses', () => {
		expect(clean('RAZ*DELIGHTFUL GOURMET Pvt Ltd,https://www.l')).toBe('delightful gourmet');
	});

	it('keeps places, which tell merchants apart', () => {
		expect(clean('ZOMATO,NEW DELHI')).toBe('zomato new delhi');
	});

	it('splits a reference off the name it runs into', () => {
		expect(clean('by debit card-OTHPG 123456789012AMAZON Mumbai--')).toBe('amazon mumbai');
	});

	it('drops a letter left where a name was cut short', () => {
		expect(clean('TO TRANSFER-UPI/DR/123456789012/SHARMA/YESB/bharatpe12/Pay t--')).toBe('sharma');
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
		const rows = [
			{ id: 'a', description: 'UPI/123456/SWIGGY' },
			{ id: 'b', description: 'UPI/654321/SWIGGY' },
		];
		expect(wordsOf(rows.map((r) => r.description))).toEqual(['swiggy']);
		expect(filled(rows, [axis(1)])).toEqual([
			{ id: 'a', vector: axis(1) },
			{ id: 'b', vector: axis(1) },
		]);
	});

	it('marks a description with no words done, with no vector', () => {
		const rows = [{ id: 'a', description: 'UPI/123456789/' }];
		expect(wordsOf(rows.map((r) => r.description))).toEqual([]);
		expect(filled(rows, [])).toEqual([{ id: 'a', vector: null }]);
	});
});
