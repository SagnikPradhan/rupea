import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err } from '#lib/server/shared/result/result.ts';
import { merge } from '#services/ledger/domain/merge.ts';
import { describe, expect, it } from 'vitest';

const merged = (file: string, draft: string) =>
	merge(defaultConfiguration.ledger, {
		draft: { key: '_/imports/sep.rupea', content: draft },
		file: { key: 'hdfc.rupea', content: file },
	});

const rent = '2026-08-01 Rent\n\tExpenses:Rent 100\n\tAssets:Bank\n';

const august = `- statement: aug.csv
- checksum: sha256:a

2026-08-01 Rent
\tExpenses:Rent 100
\tAssets:Bank

2026-08-30 Tea
\tExpenses:Food 10
\tAssets:Bank
`;

const september = `- statement: sep.csv
- checksum: sha256:s

2026-08-30 Tea
\tExpenses:Food 10
\tAssets:Bank

2026-08-15 Lunch
\t- note: with Asha
\tExpenses:Food 20
\tAssets:Bank

2026-09-02 Fuel
\tExpenses:Car 30
\tAssets:Bank
`;

describe('merging a draft into a file', () => {
	it('adds its transactions by date, leaving out those held already, and cites its statement', () =>
		expect(merged(august, september)._unsafeUnwrap()).toEqual({
			content: `- statement: aug.csv
- checksum: sha256:a
- statement: sep.csv
- checksum: sha256:s

2026-08-01 Rent
\tExpenses:Rent 100
\tAssets:Bank

2026-08-15 Lunch
\t- note: with Asha
\tExpenses:Food 20
\tAssets:Bank

2026-08-30 Tea
\tExpenses:Food 10
\tAssets:Bank

2026-09-02 Fuel
\tExpenses:Car 30
\tAssets:Bank
`,
			added: 2,
			skipped: 1,
		}));

	it('keeps a repeat the statement holds more often than the file', () => {
		const twice = `${september}\n2026-08-30 Tea\n\tExpenses:Food 10\n\tAssets:Bank\n`;

		expect(merged(august, twice)._unsafeUnwrap()).toMatchObject({ added: 3, skipped: 1 });
	});

	it('puts the metadata of a file without any above its first transaction', () =>
		expect(merged(rent, '- statement: s\n')._unsafeUnwrap().content).toBe(
			`- statement: s\n\n${rent}`,
		));

	it('fills a file holding nothing yet, in date order', () =>
		expect(merged('', september)._unsafeUnwrap().content).toBe(`- statement: sep.csv
- checksum: sha256:s

2026-08-15 Lunch
\t- note: with Asha
\tExpenses:Food 20
\tAssets:Bank

2026-08-30 Tea
\tExpenses:Food 10
\tAssets:Bank

2026-09-02 Fuel
\tExpenses:Car 30
\tAssets:Bank
`));

	it('takes the last transaction whole when no newline ends the draft', () =>
		expect(merged('', rent.trimEnd())._unsafeUnwrap().content).toBe(rent));

	it('refuses a draft holding more than transactions', () =>
		expect(merged(august, 'P 2026-08-01 USD 83 INR\n')).toEqual(
			err(fault('CannotMergeFile', { path: '_/imports/sep.rupea' })),
		));
});
