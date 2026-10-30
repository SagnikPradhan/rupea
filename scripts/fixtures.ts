import { faker } from '@faker-js/faker';
import { readConfiguration } from '#lib/server/shared/context/config.ts';
import { parse } from '#services/ledger/domain/parser.ts';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SEED = 20261021;
const TO = Temporal.PlainDate.from('2026-10-21');
const OUT = resolve('tests/fixtures/ledgers');
const CATEGORIES = ['Food', 'Transport', 'Home', 'Health', 'Fun', 'Shopping', 'Travel', 'Bills'];

type Profile = {
	years: number;
	perDay: (i: number) => number;
	shops: number;
	stocks: number;
	monthly: boolean;
};

/** What the files of each ledger look like; the wide one has many accounts and commodities in small monthly files. */
const PROFILES: Record<string, Profile> = {
	'twenty-years': { years: 20, perDay: () => 10, shops: 40, stocks: 10, monthly: false },
	'fifty-years': { years: 50, perDay: (i) => 5 + (i % 3), shops: 40, stocks: 10, monthly: false },
	wide: { years: 10, perDay: () => 4, shops: 400, stocks: 40, monthly: true },
};

type Shop = { name: string; account: string };

type Cast = { employer: string; landlord: string; us: string; stocks: string[]; shops: Shop[] };

/** What moves between days: shares' prices, the dollar's rate, the rate of the latest dollars bought and what the card owes. */
type Books = { prices: Record<string, number>; usd: number; funded: number; owed: number };

const config = readConfiguration(process.env);
const asked = process.argv.slice(2);

const generate = async (name: string, profile: Profile) => {
	faker.seed(SEED);
	const cast = castOf(profile);
	const books = booksOf(cast);
	const first = TO.year - profile.years + 1;
	const start = Temporal.PlainDate.from({ year: first, month: 1, day: 1 });
	const days = Array.from({ length: start.until(TO, { largestUnit: 'days' }).days + 1 }, (_, i) =>
		start.add({ days: i }),
	);

	const written = days.map((d, i) => ({
		key: keyOf(d, profile),
		text: [
			...dayOf({ d, count: profile.perDay(i), first, cast, books }),
			...pricesOf(d, cast, books),
		],
	}));
	const files = Object.entries(Object.groupBy(written, (w) => w.key)).map(([key, group = []]) => ({
		key,
		content: group.flatMap((w) => w.text).join('\n'),
	}));
	const opening = `${first}-01-01 Opening\n\tAssets:Zerodha 10 ${cast.stocks[0]}\n\tEquity:Opening\n`;

	const directory = join(OUT, name);
	await rm(directory, { recursive: true, force: true });
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, 'opening.rupea'), opening);
	for (const { key, content } of files) await writeFile(join(directory, key), `${content}\n`);

	const failed = files.flatMap((f) => parse(config.ledger, f).failed);
	console.info(`${name}: ${files.length + 1} files, ${failed.length} that do not parse`);
	for (const f of failed.slice(0, 5)) console.error(f);
};

const keyOf = (d: Temporal.PlainDate, p: Profile) =>
	p.monthly ? `${d.toPlainYearMonth()}.rupea` : `${d.year}.rupea`;

const castOf = (p: Profile): Cast => ({
	employer: faker.company.name(),
	landlord: faker.person.fullName(),
	us: tickerOf(),
	stocks: faker.helpers.uniqueArray(tickerOf, p.stocks),
	shops: Array.from({ length: p.shops }, shopOf),
});

const tickerOf = () => faker.string.alpha({ length: { min: 3, max: 5 }, casing: 'upper' });

const leafOf = () =>
	faker.word.noun({ length: { min: 4, max: 9 } }).replace(/^./, (c) => c.toUpperCase());

const shopOf = (): Shop => ({
	name: faker.company.name().toUpperCase(),
	account: `Expenses:${faker.helpers.arrayElement(CATEGORIES)}:${faker.commerce.department()}:${leafOf()}`,
});

const booksOf = (cast: Cast): Books => ({
	prices: Object.fromEntries(
		cast.stocks.map((s) => [s, faker.number.int({ min: 200, max: 3000 })]),
	),
	usd: 70,
	funded: 70,
	owed: 0,
});

type DayOptions = { d: Temporal.PlainDate; count: number; first: number; cast: Cast; books: Books };

/** Spending first, then what the day settles, so a card bill meets every spend before it. */
const dayOf = (o: DayOptions) => [
	...Array.from({ length: o.count }, () => spendOf(o)).flat(),
	...monthlyOf(o),
];

const spendOf = ({ d, cast, books }: DayOptions) => {
	const shop = faker.helpers.arrayElement(cast.shops);
	const amount = faker.number.int({ min: 50, max: 2500 });
	const card = faker.datatype.boolean(0.6);
	books.owed += card ? amount : 0;
	const reference = faker.string.numeric(8);

	if (card) return [`${d} ${shop.name}`, `\t${shop.account} ${amount}`, '\tLiabilities:Card', ''];

	return [`${d} UPI/${shop.name}/${reference}`, `\t${shop.account} ${amount}`, '\tAssets:Bank', ''];
};

const monthlyOf = ({ d, first, cast, books }: DayOptions) => {
	const raise = Math.round((60000 * 1.07 ** (d.year - first)) / 100) * 100;
	const usd = books.usd;
	const share = faker.helpers.arrayElement(cast.stocks);
	const price = books.prices[share];
	const month = d.toPlainYearMonth();
	const owed = books.owed;

	if (d.day === 1)
		return [`${d} Salary ${cast.employer}`, `\tAssets:Bank ${raise}`, '\tIncome:Salary', ''];
	if (d.day === 3)
		return [`${d} NEFT/${cast.landlord}`, '\tExpenses:Home:Rent 25000', '\tAssets:Bank', ''];
	if (d.day === 10) {
		books.funded = usd;
		return [`${d} Fund`, `\tAssets:IBKR 100 USD @ ${usd}`, '\tAssets:Bank', ''];
	}
	if (d.day === 12)
		return [`${d} Buy`, `\tAssets:IBKR 1 ${cast.us} @ 50 USD`, '\tAssets:IBKR -50 USD', ''];
	if (d.day === 28) return [`${d} Interest`, '\tAssets:Bank 500', '\tIncome:Interest:Bank', ''];
	if (d.month === 12 && d.day === 20)
		return [
			`${d} Withdraw`,
			`\tAssets:IBKR -50 USD {${books.funded}} @ ${books.funded}`,
			`\tAssets:Bank ${50 * books.funded}`,
			'',
		];
	if (d.day === 5 && owed > 0) {
		books.owed = 0;
		return [
			`${d} Card bill`,
			`\t- group: card-${month}`,
			`\tLiabilities:Card ${owed} = 0`,
			'\tAssets:Bank',
			'',
			`${d} PAYMENT RECEIVED THANK YOU`,
			`\t- same-as: card-${month}`,
			`\tLiabilities:Card ${owed}`,
			'\tEquity:Imports',
			'',
		];
	}
	if (d.dayOfWeek === 1 && price)
		return [`${d} Buy`, `\tAssets:Zerodha 2 ${share} @ ${price}`, '\tAssets:Bank', ''];

	return [];
};

/** Each share's price walks a little from the day before; the dollar's rate moves in whole rupees. */
const pricesOf = (d: Temporal.PlainDate, cast: Cast, books: Books) => {
	books.usd = Math.min(95, Math.max(60, books.usd + faker.number.int({ min: -1, max: 1 })));

	return [
		...cast.stocks.map((s) => `P ${d} ${s} ${walk(books.prices, s)}`),
		`P ${d} USD ${books.usd}`,
		`P ${d} ${cast.us} ${faker.number.int({ min: 40, max: 59 })} USD`,
		'',
	];
};

const walk = (prices: Record<string, number>, share: string) => {
	const next = Math.max(
		10,
		Math.round((prices[share] ?? 100) * faker.number.float({ min: 0.98, max: 1.02 })),
	);
	prices[share] = next;
	return next;
};

for (const [name, profile] of Object.entries(PROFILES))
	if (!asked.length || asked.includes(name)) await generate(name, profile);
