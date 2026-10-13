import { describe, expect, it } from 'vitest';
import { recognise, type Candidate } from '#services/extraction/domain/recognition.ts';
import { parseSchema } from '#services/extraction/domain/schema.ts';

const grid = [
	['HDFC BANK Ltd.', 'Statement of accounts'],
	['Date', 'Narration'],
];
const text = ['Account Number 00000000000'];

const candidate = (key: string, match: string, account = 'Assets:Bank:HDFC'): Candidate => {
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

const withHeader = (c: Candidate, text: string): Candidate => ({
	...c,
	schema: { ...c.schema, header: { text } },
});

const recognised = (ledger: Candidate[], builtin: Candidate[] = [], statement = 'aug.xls') =>
	recognise({ statement, grid, text, ledger, builtin }).map((c) => c.key);

describe('recognising a statement', () => {
	it('takes the one schema whose pattern matches', () => {
		const ours = [candidate('hdfc.yml', "text: '^HDFC BANK'"), candidate('sbi.yml', 'text: SBI')];
		expect(recognised(ours)._unsafeUnwrap()).toBe('hdfc.yml');
	});

	it('matches a text pattern against the lines outside the tables too', () => {
		const ours = [candidate('hdfc.yml', "text: '^Account Number'")];
		expect(recognised(ours)._unsafeUnwrap()).toBe('hdfc.yml');
	});

	it('matches a file pattern against the statement name', () => {
		expect(recognised([candidate('xls.yml', "file: '\\.xls$'")])._unsafeUnwrap()).toBe('xls.yml');
		expect(recognised([candidate('xls.yml', "file: '\\.xls$'")], [], 'aug.pdf')).toMatchObject({
			error: { type: 'ExtractionUnrecognised', path: 'aug.pdf' },
		});
	});

	it('matches when any one pattern does', () => {
		const either = candidate('hdfc.yml', "file: '\\.pdf$', text: Narration");
		expect(recognised([either])._unsafeUnwrap()).toBe('hdfc.yml');
	});

	it('refuses to choose between several', () => {
		const both = [candidate('a.yml', 'text: HDFC'), candidate('b.yml', 'text: Narration')];
		expect(recognised(both)).toMatchObject({
			error: { type: 'ExtractionAmbiguous', schemas: ['a.yml', 'b.yml'] },
		});
	});

	it('passes over a schema whose header the statement lacks', () => {
		const both = [
			candidate('savings.yml', 'text: HDFC'),
			withHeader(candidate('card.yml', 'text: HDFC'), 'Withdrawal'),
		];
		expect(recognised(both)._unsafeUnwrap()).toBe('savings.yml');
	});

	it("prefers the ledger's schemas, and falls back on built-in ones", () => {
		const builtin = [candidate('hdfc-savings.yml', 'text: HDFC')];
		expect(recognised([candidate('mine.yml', 'text: HDFC')], builtin)._unsafeUnwrap()).toBe(
			'mine.yml',
		);
		expect(recognised([candidate('sbi.yml', 'text: SBI')], builtin)._unsafeUnwrap()).toBe(
			'hdfc-savings.yml',
		);
	});

	it('needs the schema to name its account', () => {
		expect(recognised([candidate('hdfc.yml', 'text: HDFC', '')])).toMatchObject({
			error: { type: 'ExtractionWithoutAccount', path: 'hdfc.yml' },
		});
	});
});
