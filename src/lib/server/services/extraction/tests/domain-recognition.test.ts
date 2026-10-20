import { describe, expect, it } from 'vitest';
import { recognise, type ParsedSchema } from '#services/extraction/domain/recognition.ts';
import { parseSchema } from '#services/extraction/domain/schema.ts';

const grid = [
	['HDFC BANK Ltd.', 'Statement of accounts'],
	['Date', 'Narration'],
];
const text = ['Account Number 00000000000'];

const parsed = (key: string, match: string, account = 'Assets:Bank:HDFC'): ParsedSchema => {
	const content = [
		'version: v1',
		`name: ${key}`,
		`match: [${match}]`,
		account ? `account: ${account}` : '',
		'fields:',
		'  date: { from: [col: A], pipe: [date: dd/MM/yy] }',
		'  amount: { from: [col: B], pipe: [number] }',
		'  description: { from: [col: C] }',
	].join('\n');
	return { key, content, schema: parseSchema(key, content)._unsafeUnwrap() };
};

const withHeader = (c: ParsedSchema, text: string): ParsedSchema => ({
	...c,
	schema: { ...c.schema, header: { text } },
});

const recognised = (ledger: ParsedSchema[], builtin: ParsedSchema[] = [], statement = 'aug.xls') =>
	recognise({ statement, grid, text, schemas: { ledger, builtin } }).map((c) => c.key);

describe('recognising a statement', () => {
	it('takes the one schema whose pattern matches', () => {
		const ours = [parsed('hdfc.yml', 'text: HDFC BANK'), parsed('sbi.yml', 'text: SBI')];
		expect(recognised(ours)._unsafeUnwrap()).toBe('hdfc.yml');
	});

	it('matches a text pattern against the lines outside the tables too', () => {
		const ours = [parsed('hdfc.yml', 'text: Account Number')];
		expect(recognised(ours)._unsafeUnwrap()).toBe('hdfc.yml');
	});

	it('matches text anywhere in a cell, whatever its case and punctuation', () => {
		expect(recognised([parsed('hdfc.yml', 'text: bank ltd.')])._unsafeUnwrap()).toBe('hdfc.yml');
		expect(recognised([parsed('hdfc.yml', 'text: bank ltd?')])).toMatchObject({
			error: { type: 'ExtractionUnrecognised' },
		});
	});

	it('matches a regex pattern against the cells', () => {
		const ours = [parsed('hdfc.yml', "regex: '^HDFC BANK'"), parsed('sbi.yml', "regex: '^BANK'")];
		expect(recognised(ours)._unsafeUnwrap()).toBe('hdfc.yml');
	});

	it('matches a file pattern against the statement name as a glob, whatever its case', () => {
		expect(recognised([parsed('xls.yml', "file: '*.xls'")])._unsafeUnwrap()).toBe('xls.yml');
		expect(recognised([parsed('xls.yml', "file: '*.xls'")], [], 'AUG.XLS')._unsafeUnwrap()).toBe(
			'xls.yml',
		);
		expect(recognised([parsed('xls.yml', "file: '*.xls'")], [], 'aug.pdf')).toMatchObject({
			error: { type: 'ExtractionUnrecognised', path: 'aug.pdf' },
		});
	});

	it('matches when any one pattern does', () => {
		const either = parsed('hdfc.yml', "file: '*.pdf', text: Narration");
		expect(recognised([either])._unsafeUnwrap()).toBe('hdfc.yml');
	});

	it('refuses to choose between several', () => {
		const both = [parsed('a.yml', 'text: HDFC'), parsed('b.yml', 'text: Narration')];
		expect(recognised(both)).toMatchObject({
			error: { type: 'ExtractionAmbiguous', schemas: ['a.yml', 'b.yml'] },
		});
	});

	it('passes over a schema whose header the statement lacks', () => {
		const both = [
			parsed('savings.yml', 'text: HDFC'),
			withHeader(parsed('card.yml', 'text: HDFC'), 'Withdrawal'),
		];
		expect(recognised(both)._unsafeUnwrap()).toBe('savings.yml');
	});

	it("prefers the ledger's schemas, and falls back on built-in ones", () => {
		const builtin = [parsed('hdfc-savings.yml', 'text: HDFC')];
		expect(recognised([parsed('mine.yml', 'text: HDFC')], builtin)._unsafeUnwrap()).toBe(
			'mine.yml',
		);
		expect(recognised([parsed('sbi.yml', 'text: SBI')], builtin)._unsafeUnwrap()).toBe(
			'hdfc-savings.yml',
		);
	});

	it('needs the schema to name its account', () => {
		expect(recognised([parsed('hdfc.yml', 'text: HDFC', '')])).toMatchObject({
			error: { type: 'ExtractionWithoutAccount', path: 'hdfc.yml' },
		});
	});
});
