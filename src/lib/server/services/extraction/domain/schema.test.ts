import { err, ok } from '#lib/server/shared/result.ts';
import { describe, expect, it } from 'vitest';
import { parseSchema } from './schema';

const hdfc = `
version: v1
name: HDFC savings
header:
  text: Narration
records:
  each: row
  where:
    col: Date
    matches: '^\\d{2}/\\d{2}/\\d{2}$'
fields:
  date:
    from: [header: Date]
    pipe: [date: dd/MM/yy]
  description:
    from: [header: Narration]
    pipe: [trim, replace: { from: UPI-, to: '' }]
  amount:
    - from: [header: Withdrawal Amt.]
      pipe: [number, negate]
    - from: [header: Deposit Amt.]
      pipe: [number]
`;

const minimal = (f: string) => `version: v1\nname: Test\nfields:\n${f}`;

const plain = `  date: { from: [col: A], pipe: [date: yyyy-MM-dd] }
  amount: { from: [col: B], pipe: [number] }
  description: { from: [col: C] }
`;

describe('reading a schema', () => {
	it('reads a schema, every field as a list of paths', () => {
		const parsed = parseSchema('hdfc.yml', hdfc);
		expect(parsed).toMatchObject(
			ok({
				name: 'HDFC savings',
				header: { text: 'Narration' },
				records: { each: 'row', where: { col: 'Date' } },
				fields: {
					date: [{ from: [{ header: 'Date' }], pipe: [{ date: 'dd/MM/yy' }] }],
					amount: [
						{
							from: [{ header: 'Withdrawal Amt.' }],
							pipe: ['number', 'negate'],
						},
						{ from: [{ header: 'Deposit Amt.' }], pipe: ['number'] },
					],
				},
			}),
		);
		if (parsed.isOk()) expect(parsed.value.records.where?.matches.test('29/08/26')).toBe(true);
	});

	it('defaults records and pipes', () => {
		expect(parseSchema('a.yml', minimal(plain))).toMatchObject(
			ok({
				records: { each: 'row' },
				fields: { description: [{ from: [{ col: 'C' }], pipe: [] }] },
			}),
		);
	});

	it.each([
		['broken YAML', 'version: [v1'],
		['the wrong version', minimal(plain).replace('v1', 'v2')],
		['a missing field', minimal(plain.split('\n').slice(1).join('\n'))],
		['an unknown key', `${minimal(plain)}  extra: { from: [col: A] }\n`],
		['an unknown transform', minimal(plain.replace('[number]', '[money]'))],
		['an unknown locator', minimal(plain.replace('col: C', 'cell: C'))],
		['a lowercase column', minimal(plain.replace('col: C', 'col: c'))],
		['a negative move', minimal(plain.replace('col: C', 'right: -1'))],
		['a path with no locators', minimal(plain.replace('[col: C]', '[]'))],
		['a bad date format', minimal(plain.replace('yyyy-MM-dd', 'yyyy-MM'))],
		['an unknown date token', minimal(plain.replace('yyyy-MM-dd', '%Y-%m'))],
		['a bad regex', `${minimal(plain)}header: { regex: '(' }\n`],
	])('rejects %s', (_, text) => {
		expect(parseSchema('bad.yml', text)).toMatchObject(
			err({ type: 'ExtractionInvalidSchema', path: 'bad.yml' }),
		);
	});
});
