import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { withServer, type Server } from '../e2e/support/server.ts';
import { signIn } from '../e2e/support/sign-in.ts';
import { createFile } from '../e2e/support/files.ts';
import { visit } from '../e2e/support/visit.ts';

const OUT = process.env['SHOTS_OUT'] ?? 'test-results/shots';
const today = Temporal.Now.plainDateISO();
const start = Temporal.PlainDate.from('2020-11-01');

const seed = [42];
const rand = () => {
	seed[0] = (seed[0]! * 16807) % 2147483647;
	return seed[0]! / 2147483647;
};
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const amount = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));

const tx = (d: Temporal.PlainDate, payee: string, lines: string[]) =>
	`${d} ${payee}\n${lines.map((l) => `\t${l}`).join('\n')}\n`;

const bank: string[] = [];
const sbi: string[] = [];
const card: string[] = [];
const invest: string[] = [];

const inRange = (d: Temporal.PlainDate) => Temporal.PlainDate.compare(d, today) <= 0;
const add = (into: string[], d: Temporal.PlainDate, payee: string, lines: string[]) => {
	if (inRange(d)) into.push(tx(d, payee, lines));
};

const weeks = Array.from({ length: 320 }, (_, i) => start.add({ weeks: i })).filter(inRange);
const mood = (d: Temporal.PlainDate) => {
	if (d.year === 2022 && d.month <= 6) return -0.009;
	if (d.year === 2024 && d.month >= 10) return -0.006;
	if (d.year === 2025 && d.month <= 2) return -0.004;
	return 0.003;
};
const walk = (from: number, beta: number, swing: number) => {
	const series = [from];
	for (const w of weeks.slice(1))
		series.push(series.at(-1)! * (1 + beta * mood(w) + 0.0008 + (rand() - 0.5) * swing));
	return series.map((p) => Math.round(p * 100) / 100);
};
const PRICES: Record<string, number[]> = {
	INFY: walk(1180, 1.1, 0.06),
	TCS: walk(2850, 0.9, 0.05),
	HDFCBANK: walk(1390, 1, 0.05),
	NIFTYBEES: walk(148, 1, 0.035),
	PPFAS: walk(36, 0.9, 0.03),
	NIFTYIDX: walk(118, 1, 0.035),
};
for (const [s, series] of Object.entries(PRICES))
	weeks.forEach((w, i) => invest.push(`P ${w} ${s} ${series[i]}\n`));
const priceOn = (s: string, d: Temporal.PlainDate) =>
	PRICES[s]![weeks.findLastIndex((w) => Temporal.PlainDate.compare(w, d) <= 0)]!;

const owed: Record<string, number> = {};
const charge = (d: Temporal.PlainDate, payee: string, account: string, value: number) => {
	if (!inRange(d)) return;
	card.push(tx(d, payee, [`${account} ${value}`, 'Liabilities:CreditCard:HDFC']));
	owed[d.toPlainYearMonth().toString()] = (owed[d.toPlainYearMonth().toString()] ?? 0) + value;
};

const months = Array.from({ length: 72 }, (_, i) => start.add({ months: i }));
for (const m of months) {
	const day = (n: number) => m.with({ day: Math.min(n, m.daysInMonth) });
	const year = m.month >= 4 ? m.year - 2020 : m.year - 2021;
	const salary = Math.round(118000 * 1.11 ** year);
	const rent = 32000 + Math.max(0, year) * 2500;

	add(bank, day(1), 'Acme Technologies salary', [`Assets:Bank:HDFC ${salary}`, 'Income:Salary']);
	add(bank, day(3), 'Rent to landlord', [`Expenses:Housing:Rent ${rent}`, 'Assets:Bank:HDFC']);
	add(bank, day(5), 'BESCOM electricity', [
		`Expenses:Utilities:Electricity ${amount(1100, [4, 5, 6].includes(m.month) ? 4200 : 2600)}`,
		'Assets:Bank:HDFC',
	]);
	add(bank, day(6), 'Airtel fibre', ['Expenses:Utilities:Internet 1178', 'Assets:Bank:HDFC']);
	add(bank, day(6), 'Jio postpaid', ['Expenses:Utilities:Phone 399', 'Assets:Bank:HDFC']);
	add(bank, day(7), 'House help', ['Expenses:Housing:Help 6000', 'Assets:Bank:HDFC']);
	const bill = owed[m.subtract({ months: 1 }).toPlainYearMonth().toString()];
	if (bill)
		add(bank, day(15), 'HDFC credit card bill', [
			`Liabilities:CreditCard:HDFC ${bill}`,
			'Assets:Bank:HDFC',
		]);
	add(bank, day(20), 'PPF contribution', ['Assets:Investments:PPF 12500', 'Assets:Bank:HDFC']);
	add(bank, day(21), 'Move to SBI savings', [
		`Assets:Bank:SBI ${10000 + year * 2000}`,
		'Assets:Bank:HDFC',
	]);
	if (m.month % 3 === 0)
		add(sbi, day(28), 'Savings interest', [
			`Assets:Bank:SBI ${amount(900, 2400)}`,
			'Income:Interest',
		]);

	const sip = 15000 + year * 2500;
	const ppfas = priceOn('PPFAS', day(10));
	const nifty = priceOn('NIFTYIDX', day(10));
	add(invest, day(10), 'Parag Parikh Flexi Cap SIP', [
		`Assets:Investments:Kuvera ${(sip / ppfas).toFixed(3)} PPFAS @ ${ppfas}`,
		'Assets:Bank:HDFC',
	]);
	add(invest, day(10), 'UTI Nifty 50 index SIP', [
		`Assets:Investments:Kuvera ${(10000 / nifty).toFixed(3)} NIFTYIDX @ ${nifty}`,
		'Assets:Bank:HDFC',
	]);
	if (m.month % 2 === 0) {
		const s = pick(['INFY', 'TCS', 'HDFCBANK', 'NIFTYBEES']);
		const p = priceOn(s, day(12));
		const units = Math.max(1, Math.floor(amount(18000, 40000) / p));
		add(invest, day(12), `Buy ${s}`, [`Assets:Zerodha ${units} ${s} @ ${p}`, 'Assets:Bank:HDFC']);
	}

	for (const n of [2, 6, 9, 13, 16, 20, 23, 27]) {
		const store = pick(['BigBasket', 'Zepto', 'Blinkit', 'Nature’s Basket', 'Local kirana']);
		charge(day(n), store, 'Expenses:Food:Groceries', amount(450, 2900));
	}
	for (const n of [4, 11, 18, 22, 26]) {
		const place = pick([
			'Swiggy',
			'Zomato',
			'Truffles',
			'Third Wave Coffee',
			'Meghana Foods',
			'Toit',
		]);
		charge(day(n), place, 'Expenses:Food:Dining', amount(350, 2400));
	}
	for (const n of [3, 8, 12, 17, 21, 28]) {
		const ride = pick(['Uber', 'Ola', 'Rapido', 'Namma Metro recharge']);
		charge(day(n), ride, 'Expenses:Transport:Rides', amount(120, 650));
	}
	charge(day(14), 'Indian Oil', 'Expenses:Transport:Fuel', amount(2200, 3800));
	charge(day(9), 'Netflix', 'Expenses:Subscriptions:Streaming', 649);
	charge(day(12), 'Spotify', 'Expenses:Subscriptions:Music', 119);
	charge(
		day(19),
		pick(['Amazon', 'Flipkart', 'Myntra', 'Decathlon', 'IKEA']),
		'Expenses:Shopping',
		amount(900, [10, 11].includes(m.month) ? 16000 : 7800),
	);
	if (rand() > 0.5)
		charge(
			day(24),
			pick(['Apollo Pharmacy', 'Practo consult']),
			'Expenses:Health',
			amount(300, 1800),
		);
	if (m.month === 3)
		add(bank, day(20), 'Annual bonus', [
			`Assets:Bank:HDFC ${Math.round(salary * 1.4)}`,
			'Income:Bonus',
		]);
	if (m.month === 7)
		add(bank, day(28), 'Health insurance premium', [
			`Expenses:Insurance ${18000 + year * 1400}`,
			'Assets:Bank:HDFC',
		]);
	if ([5, 12].includes(m.month))
		charge(
			day(8),
			pick(['Kerala trip', 'Goa trip', 'Coorg weekend', 'Rajasthan trip', 'Ladakh trip']),
			'Expenses:Travel',
			amount(14000, 42000),
		);
}
bank.push(tx(start, 'Opening balance', ['Assets:Bank:HDFC 380000', 'Equity:Opening']));
sbi.push(tx(start, 'Opening balance', ['Assets:Bank:SBI 120000', 'Equity:Opening']));
invest.push(
	tx(Temporal.PlainDate.from('2021-01-11'), 'Buy Infosys', [
		'Assets:Zerodha 30 INFY @ 1260',
		'Assets:Bank:HDFC',
	]),
	tx(Temporal.PlainDate.from('2023-06-14'), 'Sell Infosys', [
		'Assets:Zerodha -12 INFY {1260} @ 1310',
		'Assets:Bank:HDFC 15720',
		'Income:Gains -600',
	]),
);

const recent = today.subtract({ months: 1 }).toPlainYearMonth().toString();
const renamed: Record<string, string> = {
	'Rent to landlord': 'NEFT-RENT-LANDLORD',
	'Airtel fibre': 'ACH-AIRTEL-BROADBAND',
};
const overlap = bank
	.filter((t) => t.startsWith(recent))
	.filter((t) => /salary|Rent to landlord|Airtel fibre|BESCOM/.test(t))
	.map((t) => Object.entries(renamed).reduce((x, [a, b]) => x.replace(a, b), t));

const broken = `2026-10-02 Cash withdrawal
	Assets:Cash 2000
	Assets:Bank:HDFC -1500

2026-10-04 Petrol
	Expenses:Transport:Fuel 2400
	Assets:Cash = 500
`;

const sort = (xs: string[]) =>
	xs.sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10))).join('\n');

const statement = [
	'Account statement,,,,,',
	'Savings account 50100012345678,,,,,',
	',,,,,',
	'Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance',
	'01/10/26,UPI-SWIGGY-BANGALORE,0000412,486.00,,"1,84,214.50"',
	'01/10/26,SALARY OCT ACME TECH,0000413,,"1,42,000.00","3,26,214.50"',
	'03/10/26,NEFT-RENT-LANDLORD,0000414,"32,000.00",,"2,94,214.50"',
	'05/10/26,UPI-BIGBASKET,0000415,"2,315.40",,"2,91,899.10"',
	'07/10/26,ACH-PPFAS-SIP,0000416,"10,000.00",,"2,81,899.10"',
	'09/10/26,UPI-UBER,0000417,312.00,,"2,81,587.10"',
	'12/10/26,BESCOM-ELECTRICITY,0000418,"1,840.00",,"2,79,747.10"',
	'15/10/26,CREDIT CARD PAYMENT,0000419,"28,450.00",,"2,51,297.10"',
	'18/10/26,UPI-ZOMATO,0000420,640.00,,"2,50,657.10"',
	'21/10/26,INTEREST CREDIT,0000421,,"1,212.00","2,51,869.10"',
	',,,,,',
	'Closing balance,,,,,"2,51,869.10"',
].join('\n');

const format = `version: v1
name: Savings account
match:
  - text: Account statement
account: Assets:Bank:HDFC
header:
  text: Narration
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yy] }
  description: { from: [header: Narration] }
  amount:
    - from: [header: Withdrawal Amt.]
      pipe: [number, negate]
    - from: [header: Deposit Amt.]
      pipe: [number]
  balance: { from: [header: Closing Balance], pipe: [number] }
`;

const PAGES: Record<string, string> = {
	accounts: 'accounts?range=all',
	investments: 'accounts?range=all&account=Assets%3AInvestments',
	lots: 'accounts/lots?account=Assets%3AZerodha&commodity=INFY',
	expenses: 'expenses?at=2025',
	'expenses-flow': 'expenses?at=2025&chart=alluvial',
	transactions: 'transactions',
	'new-transaction': 'transactions/new',
	postings: 'postings?account=Expenses%3AFood',
	files: 'files?file=investments.rupea',
};

const test = base.extend<{ ledger: string }, { server: Server }>({
	server: [({}, use) => withServer(use), { scope: 'worker' }],
	baseURL: ({ server }, use) => use(server.url),
	extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2,
	ledger: async ({ page, server }, use) => {
		await signIn(page, server, `${randomUUID()}@example.test`);
		await visit(page, '/');
		await page.getByRole('link', { name: 'Personal' }).click();
		await page.waitForURL('**/l/*/transactions');
		await use(new URL(page.url()).pathname.replace(/\/transactions$/, ''));
	},
});

test.setTimeout(900_000);

type Page = import('@playwright/test').Page;

/** The app as you see it: the whole window, header included. */
const full = async (page: Page, name: string) => {
	await page.mouse.move(0, 0);
	await page.screenshot({ path: `${OUT}/${name}.png` });
};

/** One piece of a page, with room around it, no taller than 16:10. */
test('screenshots', async ({ page, ledger }) => {
	const files = {
		'hdfc-bank.rupea': bank,
		'sbi.rupea': sbi,
		'hdfc-card.rupea': card,
		'investments.rupea': invest,
	};
	for (const [file, content] of Object.entries(files)) {
		await createFile(page, ledger, file, sort(content));
		await visit(page, `${ledger}/files?file=${file}`);
		await page.getByRole('button', { name: 'Format' }).click();
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	}

	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		for (const [name, path] of Object.entries(PAGES)) {
			await visit(page, `${ledger}/${path}`);
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(1500);
			await full(page, `${name}-${scheme}`);
		}
	}

	await createFile(page, ledger, 'hdfc-statement.rupea', overlap.join('\n'));
	await createFile(page, ledger, 'cash.rupea', broken);
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await visit(page, `${ledger}/refine?file=hdfc-statement.rupea`);
		await expect(page.getByRole('article').first()).toBeVisible();
		await full(page, `refine-${scheme}`);
		await visit(page, `${ledger}/files?file=cash.rupea`);
		await expect(page.getByRole('alert').first()).toBeVisible();
		await page.waitForTimeout(500);
		await full(page, `problems-${scheme}`);
	}

	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statements').setInputFiles({
		name: 'savings-oct-2026.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(statement),
	});
	await expect(page.getByRole('heading', { name: 'Describe this statement' })).toBeVisible();
	await page.getByLabel('Name', { exact: true }).fill('savings.yml');
	await page.getByLabel('Schema', { exact: true }).fill(format);
	await expect(page.getByRole('table', { name: 'Transactions found' })).toContainText('SALARY');
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.waitForTimeout(500);
		await page.mouse.move(0, 0);
		await page.evaluate(() => window.scrollTo(0, 0));
		await full(page, `import-${scheme}`);
		await page
			.getByRole('heading', { name: /transactions found/ })
			.evaluate((h) => window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120));
		await page.mouse.move(0, 0);
		await full(page, `import-draft-${scheme}`);
		await page.setViewportSize({ width: 1440, height: 4000 });
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.locator('.sheet').screenshot({ path: `${OUT}/import-grid-${scheme}.png` });
		const start = (await page.getByRole('group', { name: 'Start from' }).boundingBox())!;
		const end = (await page.getByRole('button', { name: 'Save schema' }).boundingBox())!;
		await page.screenshot({
			path: `${OUT}/import-format-${scheme}.png`,
			clip: { x: start.x - 24, y: start.y, width: 880, height: end.y + end.height + 24 - start.y },
		});
		await page.setViewportSize({ width: 1440, height: 900 });
	}
});
