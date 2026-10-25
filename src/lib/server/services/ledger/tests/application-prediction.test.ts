import { models as pinned } from '#lib/server/shared/onnx/models.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Amount, RupeaTransaction } from '#services/ledger/application/shared.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import type { Models } from '#lib/server/shared/onnx/runtime.ts';
import * as Files from '#services/ledger/application/files.ts';
import { predictAccounts } from '#services/ledger/application/prediction.ts';
import { syncIndex } from '#services/ledger/application/sync.ts';
import { broken, hashed as hashedModels, hashVector } from '#tests/shared/embedding.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it as plain } from 'vitest';
import { embedTexts } from '#services/ledger/adapters/prediction-onnx.ts';
import {
	classify as classifyWith,
	textsOf,
	THRESHOLDS,
	type Line,
	type Neighbour,
	type Thresholds,
} from '#services/ledger/domain/prediction.ts';
import { clean } from '#services/ledger/domain/text.ts';

type Embed = (texts: string[]) => ResultAsync<Float32Array[]>;

const amount = (n: bigint) => n as Amount;
const hashed: Embed = (texts) => okAsync(texts.map(hashVector));

const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);

/** What the database search does, over a ledger in memory. */
const nearestIn = (
	vectors: Float32Array[],
	described: RupeaTransaction[],
	history: Float32Array[],
): Neighbour[][] =>
	vectors.map((v) =>
		described
			.map((t, i) => ({ t, similarity: dot(v, history[i] ?? new Float32Array()) }))
			.toSorted((x, y) => y.similarity - x.similarity)
			.slice(0, 50)
			.flatMap(({ t, similarity }) =>
				t.postings.map((p) => ({ account: p.account, amount: p.amount, date: t.date, similarity })),
			),
	);

type GuessOptions = {
	thresholds: Thresholds;
	account: string;
	lines: Line[];
	today: Temporal.PlainDate;
	transactions: RupeaTransaction[];
};

/** Embeds as the model would, then searches the transactions in memory as the database would. */
const classify = (embed: Embed, o: GuessOptions) => {
	const accounts = [...new Set(o.transactions.flatMap((t) => t.postings.map((p) => p.account)))];
	const options = { ...o, accounts };
	const texts = textsOf(options);
	const described = o.transactions.filter((t) => clean(t.description) !== '');

	return embed(texts.texts).andThen((v) =>
		embed(described.map((t) => clean(t.description))).map((history) =>
			classifyWith(options, v, nearestIn(v.slice(0, texts.searched), described, history)),
		),
	);
};

const transaction = (description: string, postings: [string, bigint][], date = '2026-09-01') =>
	({
		location: { file: 'a.rupea', line: 1 },
		date: Temporal.PlainDate.from(date),
		time: null,
		description,
		metadata: {},
		postings: postings.map(([account, n]) => ({
			account,
			amount: amount(n),
			commodity: 'INR',
			price: null,
			cost: null,
			balance: null,
			metadata: {},
		})),
	}) satisfies RupeaTransaction;

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

	plain('embeds each text once', () => {
		const lines = Array(3).fill({ amount: amount(-1n), description: 'swiggy' });
		const texts = textsOf({ lines, accounts: ['Expenses:Dining'] }).texts;
		expect(texts.filter((t) => t === 'swiggy')).toHaveLength(1);
	});
});

const SWIGGY =
	'2026-09-01 "UPI/123456/SWIGGY"\n  Assets:Bank  -300 INR\n  Expenses:Dining  300 INR\n';

describe('predicting accounts in a ledger', () => {
	it('embeds the lines in one call and learns from what the ledger holds', ({ context, db }) => {
		const asked: string[][] = [];
		const models = hashedModels(context.models);
		const embed: Models['embed'] = (o) => {
			asked.push(o.texts);
			return models.embed(o);
		};

		return provide({ ...context, models: { ...models, embed } }, async () => {
			const ledger = await createLedger(db);
			await Files.createFile({ ledger, key: 'bank.rupea', content: SWIGGY });
			await syncIndex(ledger);
			asked.length = 0;

			const lines = Array(2).fill({ amount: amount(-450n), description: 'UPI/778899/SWIGGY' });
			const predicted = await predictAccounts({ ledger, account: 'Assets:Bank', lines });

			expect(predicted._unsafeUnwrap().map((p) => p.account)).toEqual([
				'Expenses:Dining',
				'Expenses:Dining',
			]);
			expect(asked).toHaveLength(1);
			expect(asked[0]?.filter((t) => t === 'swiggy')).toHaveLength(1);
		});
	});

	it('falls back to Uncategorized when the model is unavailable', ({ context, db }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			const ledger = await createLedger(db);
			const lines = [{ amount: amount(-450n), description: 'swiggy' }];
			const predicted = await predictAccounts({ ledger, account: 'Assets:Bank', lines });
			expect(predicted._unsafeUnwrap()[0]?.account).toBe('Expenses:Uncategorized');
		}));
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
		const guesses = await classify((t) => embedTexts(context.models, t), {
			...options,
			thresholds: THRESHOLDS,
			lines,
			transactions: habits,
		});
		const got = guesses._unsafeUnwrap().map((g) => g.account);
		const right = got.filter((a, i) => a === expected[i]?.[1]).length;
		expect({ right, got }).toMatchObject({ right: expect.toSatisfy((n: number) => n >= 6) });
	});
});
