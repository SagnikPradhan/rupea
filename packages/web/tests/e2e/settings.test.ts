import { createFile } from './support/files.ts';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const ledgerFile = [
	'A * Liabilities:Cards:Regalia',
	'\t- kind: card',
	'\t- limit: 300000',
	'\t- statement: 12',
	'\t- due: 2',
	'',
	'2026-10-02 Groceries',
	'\tExpenses:Food 2400',
	'\tLiabilities:Cards:Regalia',
	'',
	'2026-10-05 Rent',
	'\tExpenses:Rent 30000',
	'\tLiabilities:Loans:Home',
	'',
	'A Liabilities:Cards:Other',
	'',
].join('\n');

test('lists cards and debts not set up, with the problems a ledger has', async ({
	signedIn: page,
	ledger,
}) => {
	await createFile(page, ledger, 'cards.rupea', ledgerFile);

	await visit(page, '/settings');
	const regalia = page
		.getByRole('table', { name: /Cards in/ })
		.getByRole('row', { name: /Regalia/ });
	for (const cell of ['3,00,000', '12', '2']) await expect(regalia).toContainText(cell);
	await page.getByRole('link', { name: 'Set up Liabilities:Loans:Home' }).click();

	await expect(page.getByRole('heading', { name: 'Set up Home' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'cards.rupea:15' })).toBeVisible();
});
