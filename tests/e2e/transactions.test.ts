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

	await page.getByLabel('Description').fill('rent');
	await expect(page).toHaveURL(/description=rent/);
	await expect(rows.filter({ hasText: 'Rent' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Shop' })).toHaveCount(0);

	await page.getByLabel('Description').fill('');
	await page.getByLabel('Account').fill('expenses:food');
	await page.getByLabel('Account').press('Enter');
	await expect(page).toHaveURL(/account=expenses%3Afood/);
	await expect(rows.filter({ hasText: 'Shop 150' })).toBeVisible();
	await expect(rows.filter({ hasText: 'Rent' })).toHaveCount(0);
});

test('lists counted postings, narrowed to an account', async ({ signedIn: page, ledger }) => {
	await createFile(page, ledger, rent);

	await visit(page, `${ledger}/postings?account=Assets`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'Assets:Bank' })).toContainText('-9,000.00');
	await expect(rows.filter({ hasText: 'Expenses:Housing' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page');
});
