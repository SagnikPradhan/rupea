import { createFile } from './support/files.ts';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

/** More transactions than one page holds, a day apart, the oldest first. */
const shopping = Array.from({ length: 150 }, (_, i) => {
	const day = Temporal.PlainDate.from('2025-01-01').add({ days: i });
	const number = String(i + 1).padStart(3, '0');
	return `${day} Shop ${number}\n\tExpenses:Food:Groceries ${i + 1}\n\tAssets:Bank\n`;
});

const rent = '2025-06-15 Rent\n\tExpenses:Housing 9000\n\tAssets:Bank\n';

test('loads older transactions on scrolling, and narrows them by filter', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, 'bank.rupea', [...shopping, rent].join('\n'));

	await visit(page, `${ledger}/transactions`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'Shop 150' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Shop 001' })).toHaveCount(0);

	await expect(async () => {
		await page.mouse.wheel(0, 20_000);
		await expect(rows.filter({ hasText: 'Shop 001' })).toBeVisible({ timeout: 500 });
	}).toPass();

	await page.getByLabel('Search').fill('rent');
	await expect(page).toHaveURL(/description=rent/);
	await expect(rows.filter({ hasText: 'Rent' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Shop' })).toHaveCount(0);

	await page.getByLabel('Search').fill('');
	await expect(page).not.toHaveURL(/description=rent/);
	await page.getByRole('button', { name: 'Filter' }).click();
	const accounts = page.getByRole('navigation', { name: 'Account' });
	await accounts.getByRole('link', { name: 'Expenses', exact: true }).click();
	await accounts.getByRole('link', { name: /Groceries/ }).click();
	await expect(page).toHaveURL(/account=Expenses%3AFood%3AGroceries/);
	await expect(rows.filter({ hasText: 'Shop 150' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Rent' })).toHaveCount(0);

	const period = page.getByRole('navigation', { name: 'Period' });
	await period.getByRole('link', { name: 'Year', exact: true }).click();
	await expect(page).toHaveURL(/at=\d{4}/);
	await expect(page).toHaveURL(/account=Expenses%3AFood%3AGroceries/);
	await expect(period.getByRole('link', { name: 'Year', exact: true })).toHaveAttribute(
		'aria-current',
		'page',
	);
});

test('lists counted postings, narrowed to an account', async ({ signedIn: page, ledger }) => {
	await createFile(page, ledger, 'bank.rupea', rent);

	await visit(page, `${ledger}/postings?account=Assets`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'Assets:Bank' })).toContainText('-9,000');
	await expect(rows.filter({ hasText: 'Expenses:Housing' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Filter' }).click();
	const period = page.getByRole('navigation', { name: 'Period' });
	await expect(period.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page');
});

test('lists the postings of chosen days, then any range again', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, 'bank.rupea', [...shopping, rent].join('\n'));

	await visit(page, `${ledger}/postings?account=Expenses&from=2025-05-30&to=2025-06-15`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'Rent' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Shop 150' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Shop 149' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Filter' }).click();
	const period = page.getByRole('navigation', { name: 'Period' });
	await expect(period.getByRole('link', { name: 'Custom' })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await expect(page.getByLabel('From')).toHaveValue('2025-05-30');
	await period.getByRole('link', { name: 'All' }).click();
	await expect(page).not.toHaveURL(/from=/);
	await expect(rows.filter({ hasText: 'Shop 149' })).toBeVisible();
});

const uber =
	'2026-10-23 UPI-AJMIRA ARJUN-********26-2@IBL-NSPB0000002-131730338927-UPI\n\tAssets:Checking:HDFC = 2182947.61\n\tExpenses:Travel:Uber 270.00\n';

const swiggy =
	'2026/07/11 RAZ*Swiggy,Bangalore\n    Expenses:Food:Swiggy      829.00 INR\n    Liabilities:CreditCard:Axis\n';

test('opens a two-sided transaction in the simple view, and detail on request', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, 'bank.rupea', [rent, swiggy, uber].join('\n'));
	const panel = page.getByRole('complementary');

	for (const [name, amount] of [
		['Rent', '9000.00'],
		['RAZ*Swiggy,Bangalore', '829.00'],
		['UPI-AJMIRA ARJUN-********26-2@IBL-NSPB0000002-131730338927-UPI', '270.00'],
	] as const) {
		await visit(page, `${ledger}/transactions`);
		await page.getByRole('link', { name }).click();
		await expect(panel.getByLabel('Amount')).toHaveValue(amount);
		await expect(panel.getByLabel('Account', { exact: true })).toHaveCount(0);
	}

	await panel.getByRole('button', { name: 'Detail' }).click();

	await expect(panel.getByLabel('Account', { exact: true })).toHaveCount(2);
});

test('shows the same values after a reload as before it', async ({ signedIn: page, ledger }) => {
	await createFile(page, ledger, 'bank.rupea', [rent, swiggy].join('\n'));
	await visit(page, `${ledger}/transactions`);
	await page.getByRole('link', { name: 'Rent' }).click();
	const panel = page.getByRole('complementary');
	await expect(panel.getByLabel('Amount')).toHaveValue('9000.00');

	await panel.getByLabel('Description').fill('Changed');
	await panel.getByLabel('Amount').fill('1');

	await page.reload();

	await expect(panel.getByLabel('Amount')).toHaveValue('9000.00');
	await expect(panel.getByLabel('Description')).toHaveValue('Rent');
	await expect(panel.getByLabel('Category')).toHaveValue('Expenses:Housing');
	await expect(panel.getByLabel('Paid from')).toHaveValue('Assets:Bank');
	await expect(panel.getByLabel('Date')).toHaveValue('2025-06-15');
});

test('opens the transaction that was clicked, whichever order they are clicked in', async ({
	signedIn: page,
	ledger,
}) => {
	const entries = ['One', 'Two', 'Three'].map(
		(name, i) => `2025-06-1${i + 1} ${name}\n\tExpenses:Food ${(i + 1) * 100}\n\tAssets:Bank\n`,
	);
	await createFile(page, ledger, 'bank.rupea', entries.join('\n'));
	await visit(page, `${ledger}/transactions`);
	const panel = page.getByRole('complementary');

	for (const [name, amount] of [
		['One', '100.00'],
		['Three', '300.00'],
		['Two', '200.00'],
		['One', '100.00'],
		['Three', '300.00'],
		['Three', '300.00'],
		['Two', '200.00'],
	] as const) {
		await page.getByRole('link', { name, exact: true }).click();
		await expect(panel.getByLabel('Description')).toHaveValue(name);
		await expect(panel.getByLabel('Amount')).toHaveValue(amount);
	}
});
