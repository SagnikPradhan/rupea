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

test('adds up spending by account over a period, net of refunds', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, 'bank.rupea', spending);

	await visit(page, `${ledger}/expenses?at=${year}`);
	await expect(page.locator('.summary .figure')).toHaveText('10,000');
	await expect(page.locator('.summary')).toContainText('+5,000 (+100%) vs previous');
	const groceries = page.getByRole('row').filter({ hasText: 'Groceries' });
	await expect(groceries).toContainText('2,000');
	await expect(groceries).toContainText('20%');
	await expect(page.locator('figcaption')).toContainText('Housing 8K');
	await page.getByRole('img', { name: /^Spending/ }).hover({ position: { x: 105, y: 50 } });
	await expect(page.locator('.summary .figure')).toHaveText('8,000');

	await page.getByRole('button', { name: 'Filter' }).click();
	const accounts = page.getByRole('navigation', { name: 'Accounts' });
	await accounts.getByRole('link', { name: 'Housing' }).click();
	await expect(page).toHaveURL(/account=Expenses%3AHousing/);
	await expect(page.locator('.summary .figure')).toHaveText('8,000');

	await visit(page, `${ledger}/expenses?span=all&account=Expenses:Housing`);
	await expect(page.locator('.summary .figure')).toHaveText('13,000');

	await page.getByRole('table').getByRole('link', { name: 'Housing' }).click();
	await expect(page).toHaveURL(/postings\?account=Expenses%3AHousing&range=all/);
	await expect(page.getByRole('rowgroup').filter({ hasText: 'Rent' })).toBeVisible();
});

test('lays a month of spending out as a calendar, each day leading to its postings', async ({
	signedIn: page,
	ledger,
}) => {
	const day = Temporal.Now.plainDateISO().subtract({ days: 3 });
	await createFile(
		page,
		ledger,
		'bank.rupea',
		[`${day} Dinner`, '\tExpenses:Food 1200', '\tAssets:Bank', ''].join('\n'),
	);

	await visit(page, `${ledger}/expenses?at=${day.toPlainYearMonth()}`);
	const cell = page.getByRole('link', { name: /1.2K/ });
	await cell.hover();
	await expect(page.locator('.summary .figure')).toHaveText('1,200');

	await cell.click();
	await expect(page).toHaveURL(new RegExp(`postings\\?account=Expenses&from=${day}&to=${day}`));
	await expect(page.getByRole('rowgroup').filter({ hasText: 'Dinner' })).toBeVisible();
});
