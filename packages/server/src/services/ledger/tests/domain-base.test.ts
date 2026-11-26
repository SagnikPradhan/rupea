import { READING } from '@rupea/server/tests/shared/reading.ts';
import { currenciesFrom, setBase } from '#services/ledger/domain/base.ts';
import { describe, expect, it } from 'vitest';

const written = (content: string, base = 'USD') =>
	setBase(READING, { file: { key: 'main.rupea', content }, base })._unsafeUnwrap();

describe('setBase', () => {
	it('writes the base into an empty file', () => {
		expect(written('')).toBe('- base: USD\n');
	});

	it('replaces the base a file names, keeping what else is atop it and below', () => {
		const content =
			'- owner: ada\n- base: EUR\n\n2026-01-02 Pay\n\tAssets:Bank 10\n\tIncome:Salary\n';

		expect(written(content)).toBe(
			'- base: USD\n- owner: ada\n\n2026-01-02 Pay\n\tAssets:Bank    10.00\n\tIncome:Salary\n',
		);
	});
});

describe('currenciesFrom', () => {
	it('follows prices either way, through as many as it takes, and leaves out the unlinked', () => {
		const pairs: [string, string][] = [
			['USD', 'INR'],
			['EUR', 'USD'],
			['GBP', 'CHF'],
		];

		expect(currenciesFrom(pairs, 'INR')).toEqual(['EUR', 'INR', 'USD']);
		expect(currenciesFrom([], 'INR')).toEqual(['INR']);
	});
});
