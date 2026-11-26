import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

test('home reviews last month, each figure leading to its page', async ({ signedIn: page }) => {
	await visit(page, '/');
	const month = page.getByRole('region', { name: 'Last month' });
	for (const label of ['Net worth', /^Saved in/, /^Spent in/, 'Due in 7 days'])
		await expect(month.getByRole('link', { name: label })).toBeVisible();

	await month.getByRole('link', { name: /^Spent in/ }).click();
	await page.waitForURL(/\/spending\?at=\d{4}-\d{2}$/);
});

test('the menu opens the ledger pages and closes on the way', async ({ signedIn: page }) => {
	await visit(page, '/');
	await page.getByRole('button', { name: 'Menu' }).click();
	await page
		.getByRole('dialog', { name: 'Menu' })
		.getByRole('link', { name: 'Transactions' })
		.click();
	await page.waitForURL('**/l/*/transactions');
	await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();
});

test('the menu at a narrow width lists the pages and Sign out', async ({ signedIn: page }) => {
	await page.setViewportSize({ width: 768, height: 1000 });
	await visit(page, '/');
	await page.getByRole('button', { name: 'Menu' }).click();

	const drawer = page.getByRole('dialog', { name: 'Menu' });
	await expect(drawer.getByRole('link', { name: 'Home' })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Theme: system' })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeVisible();

	await drawer.getByRole('button', { name: 'Close' }).click();
	await expect(drawer).toBeHidden();
});
