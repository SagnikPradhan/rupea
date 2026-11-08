import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Terms from '#services/ledger/application/terms.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { groceries } from './fixtures/files';

const card = (limit: string): [string, string][] => [
	['kind', 'card'],
	['limit', limit],
];

describe('saving the terms of an account', () => {
	it('makes main.rupea on the first save, and reads them back', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);

			const saved = await Terms.saveTerms({
				ledger,
				account: 'Liabilities:Card',
				entries: card('50000'),
			});
			const held = (await Terms.listTerms({ ledger, day: '2026-11-08' }))._unsafeUnwrap();

			expect(saved._unsafeUnwrap()).toEqual({ file: 'main.rupea' });
			expect(held.map((t) => [t.account, t.current, t.held])).toEqual([
				['Liabilities:Card', { kind: 'card', limit: '50000' }, { kind: 'card', limit: '50000' }],
			]);
		}));

	it('changes the line in the file that holds it, not main.rupea', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'cards.rupea',
				content: 'A * Liabilities:Card\n\t- kind: card\n\t- limit: 50000\n',
			});
			await Files.createFile({ ledger, key: 'main.rupea', content: groceries });

			const saved = await Terms.saveTerms({
				ledger,
				account: 'Liabilities:Card',
				entries: card('80000'),
			});
			const held = (await Terms.listTerms({ ledger, day: '2026-11-08' }))._unsafeUnwrap();

			expect(saved._unsafeUnwrap()).toEqual({ file: 'cards.rupea' });
			expect(held.map((t) => t.current['limit'])).toEqual(['80000']);
		}));

	it('adds to main.rupea when only a dated line sets the account', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'cards.rupea',
				content: 'A 2026-06-01 Liabilities:Card\n\t- limit: 1\n',
			});

			const saved = await Terms.saveTerms({
				ledger,
				account: 'Liabilities:Card',
				entries: card('9'),
			});

			expect(saved._unsafeUnwrap()).toEqual({ file: 'main.rupea' });
		}));
});

describe('refusing a line that cannot be told apart', () => {
	it('will not save an account that two A * lines set up', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({
				ledger,
				key: 'a.rupea',
				content: 'A * Liabilities:Card\n\t- kind: card\n\nA * Liabilities:Card\n\t- kind: card\n',
			});

			const saved = await Terms.saveTerms({
				ledger,
				account: 'Liabilities:Card',
				entries: card('1'),
			});

			expect(saved._unsafeUnwrapErr().type).toBe('AccountRepeated');
		}));
});
