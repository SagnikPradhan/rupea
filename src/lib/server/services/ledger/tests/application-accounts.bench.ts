import { provide } from '#lib/server/shared/context/context.ts';
import * as Accounts from '#services/ledger/application/accounts.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { BEGINNING } from '#lib/shared/dates.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { sql } from 'kysely';
import { describe } from 'vitest';

const TO = Temporal.PlainDate.from('2026-10-21');
const STOCKS = ['INFY', 'TCS', 'HDFC', 'ITC', 'WIPRO', 'LT', 'SBIN', 'ONGC', 'NTPC', 'BEL'];
const PRICED = ['INFY', 'TCS', 'HDFC', 'USD'];

const LEDGERS = [
	{ name: '20 years, 10 a day', years: 20, perDay: () => 10 },
	{ name: '50 years, 5 to 7 a day', years: 50, perDay: (i: number) => 5 + (i % 3) },
];

describe('accounts', () => {
	it.for(LEDGERS)(
		'over $name',
		{ timeout: 3_600_000 },
		({ years, perDay }, { context, db, bench }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const started = performance.now();
				const first = TO.year - years + 1;
				await Files.createFile({ ledger, key: 'opening.rupea', content: openingOf(first) });
				for (const year of yearsUpTo(TO.year, years))
					await Files.createFile({ ledger, key: `${year}.rupea`, content: yearOf(year, perDay) });
				console.info(`seeded in ${Math.round(performance.now() - started)} ms`);
				await sql`analyze`.execute(db);

				const worth = (f: Temporal.PlainDate) => () =>
					provide(context, () =>
						Accounts.listWorth({ ledger, from: f, to: TO, account: null }),
					).then(() => {});
				const returns = (f: Temporal.PlainDate) => () =>
					provide(context, () => Accounts.listReturns({ ledger, from: f, to: TO })).then(() => {});
				const holdings = () =>
					provide(context, () => Accounts.listAccounts({ ledger, day: TO })).then(() => {});
				const checks = () => provide(context, () => Sync.sync(ledger)).then(() => {});
				const index = () => provide(context, () => Sync.syncIndex(ledger)).then(() => {});
				await bench.compare(
					bench('worth 1m', worth(TO.subtract({ months: 1 }))),
					bench('worth ytd', worth(TO.with({ month: 1, day: 1 }))),
					bench('worth 1y', worth(TO.subtract({ years: 1 }))),
					bench('returns 1m', returns(TO.subtract({ months: 1 }))),
					bench('returns ytd', returns(TO.with({ month: 1, day: 1 }))),
					bench('returns 1y', returns(TO.subtract({ years: 1 }))),
					bench('returns all', returns(Temporal.PlainDate.from(BEGINNING))),
					bench('holdings', holdings),
					bench('checks', checks),
					bench('index alone', index),
					{ iterations: 10, time: 0, warmupIterations: 1 },
				);
			}),
	);
});

const yearsUpTo = (l: number, c: number) => Array.from({ length: c }, (_, i) => l - c + 1 + i);

/** Shares held before the ledger began, opened on its first day at that day's price. */
const openingOf = (y: number) =>
	[`${y}-01-01 Opening`, '\tAssets:Zerodha 10 INFY', '\tEquity:Opening', ''].join('\n');

/** A year of salary, spending on a card and from the bank, card bills asserting the bank's balance, stock buys, interest, a withdrawal and daily prices. */
const yearOf = (year: number, perDay: (i: number) => number) => {
	const start = Temporal.PlainDate.from({ year, month: 1, day: 1 });
	const days = Array.from({ length: start.daysInYear }, (_, i) => start.add({ days: i }));
	const past = days.filter((d) => Temporal.PlainDate.compare(d, TO) <= 0);

	return past.flatMap((d, i) => [...dayOf(d, perDay(i)), ...pricesOf(d)]).join('\n');
};

const dayOf = (d: Temporal.PlainDate, c: number) =>
	Array.from({ length: c }, (_, n) => transactionOf(d, n)).flat();

const transactionOf = (d: Temporal.PlainDate, n: number) => {
	const seed = d.dayOfYear * 31 + n * 7 + d.year;
	const stock = STOCKS[seed % STOCKS.length];
	const price = 1000 + (seed % 900);

	if (n === 0 && d.day === 1) return [`${d} Salary`, '\tAssets:Bank 150000', '\tIncome:Salary', ''];
	if (n === 0 && d.day === 5)
		return [`${d} Card bill`, '\tLiabilities:Card 30000', '\tAssets:Bank -30000 = 0', ''];
	if (n === 1 && d.day === 10)
		return [`${d} Fund`, '\tAssets:IBKR 100 USD @ 83', '\tAssets:Bank', ''];
	if (n === 1 && d.month === 12 && d.day === 20)
		return [`${d} Withdraw`, '\tAssets:IBKR -50 USD {83} @ 83', '\tAssets:Bank 4150', ''];
	if (n === 1 && d.day === 12)
		return [`${d} Buy`, '\tAssets:IBKR 1 AAPL @ 50 USD', '\tAssets:IBKR -50 USD', ''];
	if (n === 2 && d.day === 28)
		return [`${d} Interest`, '\tAssets:Bank 500', '\tIncome:Interest:Bank', ''];
	if (n === 2 && d.dayOfWeek === 1)
		return [`${d} Buy`, `\tAssets:Zerodha 2 ${stock} @ ${price}`, '\tAssets:Bank', ''];
	if (n % 2 === 0)
		return [`${d} Lunch`, `\tExpenses:Food ${100 + (seed % 400)}`, '\tLiabilities:Card', ''];

	return [`${d} Groceries`, `\tExpenses:Groceries ${200 + (seed % 800)}`, '\tAssets:Bank', ''];
};

/** Daily prices for a few commodities, and AAPL in dollars so rupees take two hops. */
const pricesOf = (d: Temporal.PlainDate) => [
	...PRICED.map(
		(c, i) => `P ${d} ${c} ${c === 'USD' ? 83 : 1000 + ((d.dayOfYear * (i + 3)) % 900)}`,
	),
	`P ${d} AAPL ${40 + (d.dayOfYear % 20)} USD`,
	'',
];
