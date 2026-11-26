import type { Page } from '@playwright/test';
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

const panelOf = (page: Page, title: string) =>
	page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('adds up spending by account over a period, net of refunds', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, 'bank.rupea', spending);
	const figures = page.getByRole('region', { name: 'Spending figures' });
	const went = panelOf(page, 'Where the money went');

	await visit(page, `${ledger}/spending?at=${year}`);
	await expect(figures.locator('.figure').first()).toHaveText('10,000');
	await expect(figures).toContainText('+100% on the period before');
	const groceries = went.getByRole('row').filter({ hasText: 'Groceries' });
	await expect(groceries).toContainText('2,000');
	await expect(groceries).toContainText('20%');
	await expect(panelOf(page, 'By category')).toContainText('Housing');

	await page.getByRole('button', { name: 'Filter' }).click();
	const accounts = page.getByRole('navigation', { name: 'Accounts' });
	await accounts.getByRole('link', { name: 'Housing' }).click();
	await expect(page).toHaveURL(/account=Expenses%3AHousing/);
	await expect(figures.locator('.figure').first()).toHaveText('8,000');

	await visit(page, `${ledger}/spending?span=all&account=Expenses:Housing`);
	await expect(figures.locator('.figure').first()).toHaveText('13,000');

	await went.getByRole('table').getByRole('link', { name: 'Housing' }).click();
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

	await visit(page, `${ledger}/spending?at=${day.toPlainYearMonth()}`);
	const days = panelOf(page, 'Day by day');
	await expect(days.getByRole('heading', { name: 'Most in a day' })).toBeVisible();
	await expect(days.locator('.figure')).toHaveText('1,200');

	await panelOf(page, 'By category').getByRole('link', { name: /1,200/ }).click();
	await expect(page).toHaveURL(new RegExp(`postings\\?account=Expenses&from=${day}&to=${day}`));
	await expect(page.getByRole('rowgroup').filter({ hasText: 'Dinner' })).toBeVisible();
});
