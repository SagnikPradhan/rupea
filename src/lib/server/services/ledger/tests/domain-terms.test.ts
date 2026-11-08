import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { setTerms } from '#services/ledger/domain/terms.ts';
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
