import { formatAmount } from '#services/ledger/application/shared.ts';
import { describe, expect, it } from 'vitest';
import { builtinSchemas } from '#services/extraction/adapters/builtin.ts';
import { extract } from '#services/extraction/domain/runtime.ts';
import { parseSchema } from '#services/extraction/domain/schema.ts';

const builtin = (key: string) => builtinSchemas().find((s) => s.key === key)?.content ?? '';

const amounts = (content: string) =>
	extract({
		schema: parseSchema('hdfc-card.yml', content)._unsafeUnwrap(),
		file: 'card.xls',
		grid: [
			['Date & Time', 'Description', 'AMT', '', '', 'Debit / Credit'],
			['15/08/2026 / 18:41', 'UPI-CITY CAFE', '195.00', '', '', ''],
			['15/08/2026 / 19:02', 'CREDIT CARD PAYMENT', '7,073.00', '', '', 'Cr'],
		],
	})
		._unsafeUnwrap()
		.succeeded.map((r) => formatAmount(r.amount));

describe('built-in schemas', () => {
	it.each(builtinSchemas())('$key parses and names its account', ({ key, content }) => {
		expect(parseSchema(key, content)._unsafeUnwrap().account).toMatch(/^(Assets|Liabilities):/);
	});

	it('reads an HDFC card credit by its Cr mark, which comes before the amount spent', () => {
		const content = builtin('hdfc-card.yml');
		const credit = '    - from: [text: Cr, left: 3]\n      pipe: [number]\n';
		const spent = '    - from: [header: AMT]\n      pipe: [number, negate]\n';

		expect(amounts(content)).toEqual(['-195.00', '7073.00']);
		expect(amounts(content.replace(credit + spent, spent + credit))).toEqual([
			'-195.00',
			'-7073.00',
		]);
	});
});
