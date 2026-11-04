import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

test('home shows the balance sheet, and says what it cannot read yet', async ({
	signedIn: page,
}) => {
	await visit(page, '/');
	await expect(page.getByRole('heading', { name: 'Balance sheet' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Income statement' })).toBeVisible();
	await expect(page.getByText(/^Coming soon · /).first()).toBeVisible();
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

test('the menu at a narrow width lists the pages and Log out', async ({ signedIn: page }) => {
	await page.setViewportSize({ width: 768, height: 1000 });
	await visit(page, '/');
	await page.getByRole('button', { name: 'Menu' }).click();

	const drawer = page.getByRole('dialog', { name: 'Menu' });
	await expect(drawer.getByRole('link', { name: 'Home' })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Theme: system' })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Log out' })).toBeVisible();

	await drawer.getByRole('button', { name: 'Close' }).click();
	await expect(drawer).toBeHidden();
});
