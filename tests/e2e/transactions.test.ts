import type { Page } from '@playwright/test';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

/** More transactions than one page holds, a day apart, the oldest first. */
const shopping = Array.from({ length: 150 }, (_, i) => {
	const day = Temporal.PlainDate.from('2025-01-01').add({ days: i });
	const number = String(i + 1).padStart(3, '0');
	return `${day} Shop ${number}\n\tExpenses:Food:Groceries ${i + 1}\n\tAssets:Bank\n`;
});

const rent = '2025-06-15 Rent\n\tExpenses:Housing 9000\n\tAssets:Bank\n';

const createFile = async (page: Page, ledger: string, content: string) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill('bank.rupee');
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByRole('heading', { name: 'bank.rupee' })).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Breadcrumb' })
		.getByRole('link', { name: 'Files' })
		.click();
	await page.getByRole('link', { name: 'bank.rupee' }).click();
	await page.getByLabel('Ledger file').fill(content);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
};

test('loads older transactions on scrolling, and narrows them by filter', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, [...shopping, rent].join('\n'));

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
	const accounts = page.getByRole('navigation', { name: 'Account' });
	await accounts.getByRole('link', { name: 'Expenses' }).click();
	await accounts.getByRole('link', { name: 'Expenses:Food' }).click();
	await expect(page).toHaveURL(/account=Expenses%3AFood/);
	await expect(rows.filter({ hasText: 'Shop 150' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Rent' })).toHaveCount(0);

	await page.getByRole('link', { name: '1Y', exact: true }).click();
	await expect(page).toHaveURL(/range=1y/);
	await expect(page.getByRole('link', { name: '1Y', exact: true })).toHaveAttribute(
		'aria-current',
		'page',
	);
});

test('lists counted postings, narrowed to an account', async ({ signedIn: page, ledger }) => {
	await createFile(page, ledger, rent);

	await visit(page, `${ledger}/postings?account=Assets`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'Assets:Bank' })).toContainText('-9,000.00');
	await expect(rows.filter({ hasText: 'Expenses:Housing' })).toHaveCount(0);
	const dates = page.getByRole('navigation', { name: 'Date' });
	await expect(dates.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page');
});

test('lists the postings of chosen days, then any range again', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, [...shopping, rent].join('\n'));

	await visit(page, `${ledger}/postings?account=Expenses&from=2025-05-30&to=2025-06-15`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'Rent' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Shop 150' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Shop 149' })).toHaveCount(0);

	const dates = page.getByRole('navigation', { name: 'Date' });
	await expect(dates.getByRole('link', { name: '30 May 2025 – 15 Jun 2025' })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await dates.getByRole('link', { name: 'All' }).click();
	await expect(page).not.toHaveURL(/from=/);
	await expect(rows.filter({ hasText: 'Shop 149' })).toBeVisible();
});
