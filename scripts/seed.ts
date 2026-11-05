import { faker } from '@faker-js/faker';
import { openDatabase } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { readConfiguration } from '#lib/server/shared/context/config.ts';
import { createContext } from '#lib/server/shared/context/environment.ts';
import { petName } from '#lib/server/shared/names.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import * as Auth from '#services/auth/adapters/database.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Ledgers from '#services/ledger/application/ledger.ts';
import { syncIndex } from '#services/ledger/application/sync.ts';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const SEED = 20261105;
const MONTHS = 24;
const LAST = Temporal.PlainYearMonth.from('2026-10');
const EMAIL = 'demo@rupea.dev';

const PRICES = { NIFTYBEES: 235, GOLDBEES: 54 };
const DIVIDEND_MONTHS = [1, 4, 7, 10];
const TRIPS: Record<number, [string, number]> = {
	5: ['Goa trip', 52000],
	11: ['Rajasthan trip', 64000],
};

/** What each spending account takes in a month: how many times, and the least and most each time. */
const SPENDING: Record<string, [number, number, number]> = {
	'Expenses:Food:Groceries': [5, 3000, 5000],
	'Expenses:Food:Dining': [6, 600, 3000],
	'Expenses:Transport': [8, 150, 900],
	'Expenses:Gifts': [1, 4000, 12000],
	'Expenses:Travel': [1, 9000, 16000],
};

type Entry = { day: number; text: string[] };

const args = parseArgs({ allowPositionals: true });
const email = args.positionals[0] ?? EMAIL;

const must = async <T>(r: ResultAsync<T>): Promise<T> => (await r)._unsafeUnwrap();

const openingOf = (first: Temporal.PlainYearMonth) =>
	[
		`${first.toPlainDate({ day: 1 })} Opening`,
		'\tAssets:Bank:HDFC 800000',
		'\tAssets:Bank:ICICI 300000',
		'\tAssets:Retirement:EPF 600000',
		'\tLiabilities:Loan -900000',
		'\tEquity:Opening',
		'',
	].join('\n');

/** Every transaction and price of one month, in the order of its days. */
const monthOf = (month: Temporal.PlainYearMonth, index: number, prices: Record<string, number>) => {
	const entries = [
		...incomeOf(month, index),
		...fixedOf(month),
		...investedOf(month, prices),
		...Object.entries(SPENDING).flatMap(([account, range]) => spendsOf(month, account, range)),
		...tripsOf(month),
		...pricesOf(month, prices),
	];

	return entries
		.toSorted((a, b) => a.day - b.day)
		.flatMap((e) => e.text)
		.join('\n');
};

const incomeOf = (month: Temporal.PlainYearMonth, index: number): Entry[] => {
	const salary = index < 12 ? 160000 : 185000;
	const dividend = DIVIDEND_MONTHS.includes(month.month);

	return [
		entry(month, 1, 'Salary', ['Assets:Bank:HDFC', salary, 'Income:Salary']),
		entry(month, 28, 'Provident fund', ['Assets:Retirement:EPF', 15000, 'Income:Salary']),
		...(dividend
			? [entry(month, 20, 'Dividends', ['Assets:Bank:ICICI', 10000, 'Income:Dividends'])]
			: []),
	];
};

const fixedOf = (month: Temporal.PlainYearMonth): Entry[] => [
	entry(month, 3, 'Rent', ['Expenses:Home:Rent', 42000, 'Assets:Bank:HDFC']),
	entry(month, 8, 'Electricity and internet', [
		'Expenses:Home:Utilities',
		faker.number.int({ min: 7500, max: 10500 }),
		'Assets:Bank:HDFC',
	]),
	{
		day: 5,
		text: [
			`${month.toPlainDate({ day: 5 })} Loan payment`,
			'\tLiabilities:Loan 18000',
			'\tExpenses:Interest 4000',
			'\tAssets:Bank:HDFC',
			'',
		],
	},
];

const investedOf = (month: Temporal.PlainYearMonth, prices: Record<string, number>): Entry[] => [
	buyOf(month, 'Assets:Investments:Equity', 'NIFTYBEES', 25000, prices),
	buyOf(month, 'Assets:Investments:Gold', 'GOLDBEES', 15000, prices),
];

const buyOf = (
	month: Temporal.PlainYearMonth,
	account: string,
	share: string,
	budget: number,
	prices: Record<string, number>,
): Entry => {
	const price = prices[share] ?? 100;
	const units = Math.floor(budget / price);
	return {
		day: 7,
		text: [
			`${month.toPlainDate({ day: 7 })} Buy ${share}`,
			`\t${account} ${units} ${share} @ ${price}`,
			'\tAssets:Bank:HDFC',
			'',
		],
	};
};

const spendsOf = (month: Temporal.PlainYearMonth, account: string, range: number[]): Entry[] => {
	const [count = 1, least = 100, most = 1000] = range;
	return Array.from({ length: count }, () =>
		entry(month, faker.number.int({ min: 2, max: 27 }), faker.company.name(), [
			account,
			faker.number.int({ min: least, max: most }),
			'Assets:Bank:HDFC',
		]),
	);
};

const tripsOf = (month: Temporal.PlainYearMonth): Entry[] => {
	const trip = TRIPS[month.month];
	if (!trip) return [];
	return [entry(month, 15, trip[0], ['Expenses:Travel', trip[1], 'Assets:Bank:HDFC'])];
};

/** Each price steps a little from the one before, on the way up. */
const pricesOf = (month: Temporal.PlainYearMonth, prices: Record<string, number>): Entry[] =>
	[1, 8, 15, 22, 28].map((day) => ({
		day,
		text: Object.keys(prices).map((share) => {
			const next = (prices[share] ?? 100) * faker.number.float({ min: 0.985, max: 1.0225 });
			prices[share] = Math.round(next * 100) / 100;
			return `P ${month.toPlainDate({ day })} ${share} ${prices[share]}`;
		}),
	}));

const entry = (
	month: Temporal.PlainYearMonth,
	day: number,
	description: string,
	[debit, amount, credit]: [string, number, string],
): Entry => ({
	day,
	text: [`${month.toPlainDate({ day })} ${description}`, `\t${debit} ${amount}`, `\t${credit}`, ''],
});

const config = readConfiguration(process.env);
const database = await openDatabase({
	url: config.storage.database,
	directory: resolve(config.storage.files, 'postgres'),
});
await database.migrate();
const context = createContext(config, database.db, false, []);

await provide(context, async () => {
	const user = await must(Auth.findUserByEmail(email)).then(
		(f) => f ?? must(Auth.createUser({ email, username: petName() })),
	);
	const ledger = await must(Ledgers.listLedgers({ user: user.id })).then(
		(f) => f[0] ?? must(Ledgers.createLedger({ user: user.id, name: 'Personal' })),
	);
	const existing = await must(Files.listFiles(ledger));

	if (existing.succeeded.length > 0)
		return console.log(`${email} already has files, so left alone`);

	faker.seed(SEED);
	const prices = { ...PRICES };
	const months = Array.from({ length: MONTHS }, (_, i) =>
		LAST.subtract({ months: MONTHS - 1 - i }),
	);
	const files = [
		{ key: 'opening.rupea', content: openingOf(months[0]!) },
		...months.map((m, i) => ({ key: `${m}.rupea`, content: monthOf(m, i, prices) })),
	];

	for (const f of files) await must(Files.createFile({ ledger, ...f }));
	await must(syncIndex(ledger));

	console.log(`seeded ${files.length} files for ${email}, sign in with that address`);
});

await database.close();
