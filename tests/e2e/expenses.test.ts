import { createFile } from './support/files.ts';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const year = Temporal.Now.plainDateISO().year;

const spending = [
	`${year}-01-10 Groceries`,
	'\tExpenses:Food:Groceries 3000',
	'\tAssets:Bank',
	'',
	`${year}-01-20 Refund`,
	'\tExpenses:Food:Groceries -1000',
	'\tAssets:Bank',
	'',
	`${year}-02-05 Rent`,
	'\tExpenses:Housing 8000',
	'\tAssets:Bank',
	'',
	`${year - 1}-06-01 Last year`,
	'\tExpenses:Housing 5000',
	'\tAssets:Bank',
	'',
].join('\n');

test('adds up spending by account over a range, net of refunds', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, 'bank.rupee', spending);

	await visit(page, `${ledger}/expenses`);
	await expect(page.locator('.figure')).toHaveText('10,000.00');
	await expect(page.locator('.summary')).toContainText('+5,000.00 (+100%) vs previous');
	const food = page.getByRole('row').filter({ hasText: 'Food' }).first();
	await expect(food).toContainText('2,000.00');
	await expect(food).toContainText('20%');
	await expect(page.locator('figcaption')).toContainText('Housing 8,000.00');
	await page.getByRole('img', { name: /^Spending/ }).hover({ position: { x: 105, y: 120 } });
	await expect(page.locator('.figure')).toHaveText('8,000.00');

	await page.getByRole('link', { name: 'All', exact: true }).click();
	await expect(page).toHaveURL(/range=all/);
	await expect(page.locator('.figure')).toHaveText('15,000.00');

	await page.getByRole('link', { name: 'Housing' }).click();
	await expect(page).toHaveURL(/postings\?account=Expenses%3AHousing&range=all/);
	await expect(page.getByRole('rowgroup').filter({ hasText: 'Rent' })).toBeVisible();
});
