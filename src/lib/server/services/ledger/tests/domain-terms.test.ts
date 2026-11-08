import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { setTerms, termsOn } from '#services/ledger/domain/terms.ts';
import { describe, expect, it } from 'vitest';

const c = defaultConfiguration.ledger;
const set = (content: string, terms: [string, string][], account = 'Liabilities:Card') =>
	setTerms(c, { file: { key: 'main.rupea', content }, account, terms });

describe('setting the terms of an account', () => {
	it('starts a file with the A line when the file is empty', () => {
		expect(
			set('', [
				['kind', 'card'],
				['limit', '50000'],
			])._unsafeUnwrap(),
		).toBe('A * Liabilities:Card\n\t- kind: card\n\t- limit: 50000\n');
	});

	it('adds the A line after what the file holds', () => {
		const content = '2026-10-01 Pay\n\tLiabilities:Card  100.00\n\tAssets:Bank\n';

		expect(set(content, [['kind', 'card']])._unsafeUnwrap()).toBe(
			`${content}\nA * Liabilities:Card\n\t- kind: card\n`,
		);
	});

	it('rewrites the terms of the line in place, keeping its comments and the other accounts', () => {
		const content = [
			'A * Liabilities:Loans:Home',
			'\t- rate: 8',
			'',
			'A * Liabilities:Card',
			'\t- kind: card',
			'\t- limit: 50000',
			'; keep this',
			'',
		].join('\n');

		expect(
			set(content, [
				['kind', 'card'],
				['limit', '80000'],
			])._unsafeUnwrap(),
		).toBe(
			[
				'A * Liabilities:Loans:Home',
				'\t- rate: 8',
				'',
				'A * Liabilities:Card',
				'\t- kind: card',
				'\t- limit: 80000',
				'; keep this',
				'',
			].join('\n'),
		);
	});

	it('leaves a dated line for the account alone', () => {
		const content = 'A 2026-06-01 Liabilities:Card\n\t- limit: 1\n';

		expect(set(content, [['kind', 'card']])._unsafeUnwrap()).toBe(
			`${content}\nA * Liabilities:Card\n\t- kind: card\n`,
		);
	});

	it('refuses a value that would not read back as written', () => {
		expect(set('', [['kind', 'card\n2026-10-01 Sneak']]).isErr()).toBe(true);
		expect(set('', [['kind', 'card\n2026-10-01 Sneak']])._unsafeUnwrapErr()).toEqual(
			fault('CannotWriteTerms', { path: 'main.rupea' }),
		);
	});
});

describe('the terms of accounts on a day', () => {
	const at = (
		account: string,
		since: string | null,
		terms: Record<string, string[]>,
		line = 1,
	) => ({
		account,
		since,
		terms,
		file: 'main.rupea',
		line,
	});

	it('lets a dated line override only the keys it names, from its day on', () => {
		const lines = [
			at('Liabilities:Card', null, { kind: ['card'], limit: ['50000'], rate: ['42'] }, 1),
			at('Liabilities:Card', '2026-06-01', { limit: ['80000'] }, 4),
		];

		expect(termsOn(lines, '2026-05-31')[0]?.held).toMatchObject({ limit: '50000', rate: 42 });
		expect(termsOn(lines, '2026-06-01')[0]?.held).toMatchObject({ limit: '80000', rate: 42 });
		expect(termsOn(lines, '2026-06-01')[0]?.current).toEqual({
			kind: 'card',
			limit: '50000',
			rate: '42',
		});
	});

	it('lets the later written line win on one day, and matches accounts by case', () => {
		const lines = [
			at('Liabilities:Card', null, { kind: ['card'], limit: ['1'] }, 1),
			at('liabilities:card', null, { limit: ['2'] }, 5),
		];

		expect(termsOn(lines, '2026-06-01')).toHaveLength(1);
		expect(termsOn(lines, '2026-06-01')[0]?.held).toMatchObject({ limit: '2' });
	});

	it('holds nothing for an account whose terms do not read as a loan or a card', () => {
		expect(
			termsOn([at('Assets:Bank', null, { kind: ['house'] })], '2026-06-01')[0]?.held,
		).toBeNull();
	});
});
