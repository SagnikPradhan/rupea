import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { describe, expect, it } from 'vitest';
import { format } from '#services/ledger/domain/format.ts';
import { parse } from '#services/ledger/domain/parser.ts';

const messy = [
	'',
	'- statement: a.csv   ',
	'; kept as written  ',
	'2026-08-29 Groceries',
	'  - receipt: r1',
	'    Expenses:Food     100.50   @  2 USD',
	'      - note: weekly',
	'  Assets:Bank',
	'',
	'',
	'',
	'2026-08-30 Salary',
	'\tAssets:Bank 50000',
	'\tIncome:Salary',
	'',
].join('\n');

describe('format', () => {
	it('aligns amounts, indents metadata by what it belongs to, and keeps comments', () => {
		expect(format(messy)).toBe(
			[
				'- statement: a.csv',
				'; kept as written',
				'2026-08-29 Groceries',
				'\t- receipt: r1',
				'\tExpenses:Food  100.50 @ 2 USD',
				'\t\t- note: weekly',
				'\tAssets:Bank',
				'',
				'2026-08-30 Salary',
				'\tAssets:Bank    50000',
				'\tIncome:Salary',
				'',
			].join('\n'),
		);
	});

	it('reads back as the same ledger', () => {
		const read = (content: string) => {
			const parsed = parse(defaultConfiguration.ledger, { key: 'a.rupea', content });
			return {
				metadata: parsed.metadata,
				transactions: parsed.succeeded.map((t) => ({ ...t, location: null })),
				failed: parsed.failed.length,
			};
		};

		expect(read(messy).transactions).toHaveLength(2);
		expect(read(format(messy))).toEqual(read(messy));
	});

	it('leaves a tidy file as it is', () => {
		expect(format(format(messy))).toBe(format(messy));
	});

	it('leaves an empty file empty', () => {
		expect(format('\n\n')).toBe('');
	});
});
