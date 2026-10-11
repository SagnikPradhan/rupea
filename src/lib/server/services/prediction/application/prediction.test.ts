import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Amount, RupeeTransaction } from '#services/ledger/domain/types.ts';
import { defaultConfiguration } from '#lib/server/shared/config.ts';
import { models as pinned } from '#lib/server/shared/onnx/models.ts';
import { okAsync } from '#lib/server/shared/result.ts';
import { hashVector } from '#tests/shared/embedding.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect, it as plain } from 'vitest';
import { embedder } from '../adapters/onnx';
import type { Embed } from '../domain/prediction';
import { classify } from './prediction';

const amount = (n: bigint) => n as Amount;
const hashed: Embed = (texts) => okAsync(texts.map(hashVector));

const transaction = (description: string, postings: [string, bigint][], date = '2026-09-01') =>
	({
		location: { file: 'a.rupee', line: 1 },
		date: Temporal.PlainDate.from(date),
		time: null,
		description,
		metadata: {},
		postings: postings.map(([account, n]) => ({
			account,
			amount: amount(n),
			commodity: 'INR',
			price: null,
			balance: null,
			metadata: {},
		})),
	}) satisfies RupeeTransaction;

const spend = (description: string, account: string) =>
	transaction(description, [
		['Assets:Bank', -300n],
		[account, 300n],
	]);

const options = {
	thresholds: { history: 0.15, name: 0.3 },
	account: 'Assets:Bank',
	today: Temporal.PlainDate.from('2026-10-01'),
};

describe('classifying statement lines', () => {
	plain('learns what a merchant is from the ledger, however its reference reads', async () => {
		const transactions = Array(3).fill(spend('UPI/123456/SWIGGY', 'Expenses:Dining'));
		const lines = [{ amount: amount(-450n), description: 'UPI/778899/SWIGGY ORDER' }];
		const guesses = await classify(hashed, { ...options, lines, transactions });
		expect(guesses._unsafeUnwrap()).toMatchObject([
			{ account: 'Expenses:Dining', source: 'history' },
		]);
	});

	plain('uses the global accounts when the ledger has nothing to say', async () => {
		const lines = [{ amount: amount(90000n), description: 'salary' }];
		const guesses = await classify(hashed, { ...options, lines, transactions: [] });
		expect(guesses._unsafeUnwrap()).toMatchObject([{ account: 'Income:Salary', source: 'name' }]);
	});

	plain('prefers an account the user has over a global one of the same name', async () => {
		const transactions = [spend('HOUSE KEEPER', 'Expenses:Housing:Rent')];
		const lines = [{ amount: amount(-100n), description: 'rent' }];
		const guesses = await classify(hashed, { ...options, lines, transactions });
		expect(guesses._unsafeUnwrap()[0]?.account).toBe('Expenses:Housing:Rent');
	});

	plain('leaves lines uncategorised that nothing fits, or that have no words', async () => {
		const lines = [
			{ amount: amount(-100n), description: 'qqqq zzzz' },
			{ amount: amount(100n), description: 'UPI/123456789/' },
		];
		const guesses = await classify(hashed, { ...options, lines, transactions: [] });
		expect(guesses._unsafeUnwrap().map((g) => g.account)).toEqual([
			'Expenses:Uncategorized',
			'Income:Uncategorized',
		]);
	});

	plain('embeds each text once', async () => {
		const seen: string[][] = [];
		const embed: Embed = (texts) => {
			seen.push(texts);
			return hashed(texts);
		};
		const transactions = Array(4).fill(spend('SWIGGY', 'Expenses:Dining'));
		const lines = Array(3).fill({ amount: amount(-1n), description: 'swiggy' });
		await classify(embed, { ...options, lines, transactions });
		expect(seen).toHaveLength(1);
		expect(seen[0]?.filter((t) => t === 'swiggy')).toHaveLength(1);
	});
});

const live = pinned.every(({ file }) => existsSync(join('data/models', file)));

const habits = [
	['UPI/1/SWIGGY', 'Expenses:Dining'],
	['UPI/2/ZOMATO', 'Expenses:Dining'],
	['UPI/3/BIGBASKET', 'Expenses:Groceries'],
	['POS/4/DMART', 'Expenses:Groceries'],
	['UPI/5/UBER TRIP', 'Expenses:Commute'],
	['UPI/6/OLA CABS', 'Expenses:Commute'],
].map(([d, a]) => spend(d as string, a as string));

const expected = [
	['UPI/778899/SWIGGY INSTAMART', 'Expenses:Dining'],
	['UPI/110022/ZOMATO ORDER', 'Expenses:Dining'],
	['POS/330011/DMART AVENUE', 'Expenses:Groceries'],
	['UPI/998811/UBER INDIA', 'Expenses:Commute'],
	['UPI/223344/HPCL PETROL PUMP', 'Expenses:Transport:Fuel'],
	['NEFT/445566/ACME CORP SALARY SEP', 'Income:Salary'],
	['UPI/665544/NETFLIX SUBSCRIPTION', 'Expenses:Entertainment'],
	['UPI/112233/APOLLO PHARMACY', 'Expenses:Health:Medical'],
];

describe('classifying with the real model', () => {
	it.skipIf(!live)('gets most lines right', async ({ context }) => {
		const lines = expected.map(([description, account]) => ({
			description: description as string,
			amount: amount(account?.startsWith('Income') ? 5000n : -500n),
		}));
		const guesses = await classify(embedder(context.models), {
			...options,
			thresholds: defaultConfiguration.prediction,
			lines,
			transactions: habits,
		});
		const got = guesses._unsafeUnwrap().map((g) => g.account);
		const right = got.filter((a, i) => a === expected[i]?.[1]).length;
		expect({ right, got }).toMatchObject({ right: expect.toSatisfy((n: number) => n >= 6) });
	});
});
