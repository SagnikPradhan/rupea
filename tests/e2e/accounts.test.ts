import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const ledgerFile = [
	'2026-01-02 Buy',
	'\tAssets:Zerodha 10 INFY @ 1500',
	'\tAssets:Bank',
	'',
	'2026-03-01 Sell',
	'\tAssets:Zerodha -4 INFY {1500} @ 1700',
	'\tAssets:Bank 6800',
	'\tIncome:Gains -800',
	'',
	'2026-04-01 Bonus',
	'\tAssets:Zerodha 1 TCS',
	'\tIncome:Bonus -1 TCS',
	'',
	'P 2026-10-01 INFY 1800',
	'',
].join('\n');

test('shows what each account holds and what it is worth', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill('shares.rupee');
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByRole('heading', { name: 'shares.rupee' })).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Breadcrumb' })
		.getByRole('link', { name: 'Files' })
		.click();
	await page.getByRole('link', { name: 'shares.rupee' }).click();
	await page.getByLabel('Ledger file').fill(ledgerFile);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

	await visit(page, `${ledger}/accounts`);
	const zerodha = page.getByRole('row').filter({ hasText: 'Zerodha' });
	for (const cell of ['1 unpriced', '9,000.00', '10,800.00', '1,800.00', '+20%'])
		await expect(zerodha).toContainText(cell);
	const infy = page.getByRole('row').filter({ hasText: 'INFY' });
	for (const cell of ['6.00 INFY', '9,000.00', '10,800.00', '1,800.00', '+20%'])
		await expect(infy).toContainText(cell);
	await expect(infy.getByTitle('@ 1,800.00')).toHaveText('10,800.00');
	await expect(page.getByRole('row').filter({ hasText: 'TCS' })).toContainText('unpriced');

	const worth = page.getByRole('region', { name: 'Net worth' });
	await expect(worth).toContainText('2,600.00');
	await expect(worth).toContainText('excludes 1 unpriced');
	await page.getByRole('link', { name: '1Y' }).click();
	await expect(page).toHaveURL(/range=1y/);
	await expect(worth.getByRole('img', { name: /^Net worth from 2 Jan 2026/ })).toBeVisible();

	await page.getByRole('link', { name: 'INFY' }).click();
	await expect(page.getByRole('heading', { name: 'INFY in Assets:Zerodha' })).toBeVisible();
	await expect(page.getByRole('row', { name: /buy/i })).toContainText('6.00 left');
	await expect(page.getByRole('row').filter({ hasText: 'sale' })).toContainText('800.00');
});
