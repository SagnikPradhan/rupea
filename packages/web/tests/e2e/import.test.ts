import { readFile } from 'node:fs/promises';
import { addToLedger, data, describeStatement, upload } from './support/imports.ts';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const books = '2026-08-29 Tea\n\tExpenses:Food 10\n\tAssets:Cash\n';

const review = /^Add \d+ transactions? to ledger$/;

test('a new user imports a statement from a bank Rupea knows, and sees it on home and in net worth', async ({
	signedIn: page,
	ledger,
}) => {
	await upload(page, ledger, 'sbi.csv');
	const found = page.getByRole('table', { name: 'Transactions found' });
	await expect(found.getByRole('row').filter({ hasText: 'UPI SWIGGY' })).toContainText('450');
	await expect(page.getByRole('region', { name: 'Schema setup' })).toHaveCount(0);
	await addToLedger(page, 'sbi.rupea');
	await expect(page.getByRole('link', { name: 'Open sbi.rupea' })).toBeVisible();

	await visit(page, `${ledger}/transactions`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'UPI BIGBASKET' })).toContainText('2,300');
	await expect(rows.filter({ hasText: 'SALARY OCT' })).toContainText('80,000');

	await visit(page, '/');
	const month = page.getByRole('region', { name: 'Last month' });
	await expect(month).toContainText('77,250');

	await visit(page, `${ledger}/net-worth`);
	await expect(page.getByRole('row').filter({ hasText: 'SBI' }).first()).toContainText('77,250');

	await visit(page, `${ledger}/files`);
	await expect(page.getByRole('row', { name: /sbi\.csv/ })).toContainText('Added to your ledger');
});

test('teaches Rupea a new bank once, and adds its later statement to the same file', async ({
	signedIn: page,
	ledger,
}) => {
	test.slow();
	await upload(page, ledger, 'statement.csv');
	await describeStatement(page);
	await page.getByRole('button', { name: 'Save schema' }).click();
	await page.getByRole('button', { name: 'Continue to review' }).click();
	await addToLedger(page, 'bank.rupea');

	await visit(page, `${ledger}/transactions`);
	const rows = page.getByRole('rowgroup');
	await expect(rows.filter({ hasText: 'UPI GROCER' })).toContainText('1,251');
	await expect(rows.filter({ hasText: 'SALARY' })).toContainText('50,000');

	const later = (await readFile(data('statement.csv'), 'utf8')) + '31/08/26,UPI CHEMIST,320,\n';
	await upload(page, ledger, { name: 'later.csv', text: later });
	await page.getByRole('button', { name: review }).click();
	await expect(page.getByRole('combobox', { name: 'Add to file' })).toHaveValue('bank.rupea');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(/^Added 1 to/)).toBeVisible();

	await visit(page, `${ledger}/transactions`);
	await expect(rows.filter({ hasText: 'UPI CHEMIST' })).toContainText('320');
	await expect(rows.filter({ hasText: 'UPI GROCER' })).toHaveCount(1);
});

test('undoes an import, putting the statement back in review', async ({
	signedIn: page,
	ledger,
}) => {
	await upload(page, ledger, { name: 'books.ledger', text: books });
	await addToLedger(page, 'books.rupea');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('button', { name: review })).toBeVisible();
	await visit(page, `${ledger}/transactions`);
	await expect(page.getByRole('rowgroup').filter({ hasText: 'Tea' })).toHaveCount(0);
	await visit(page, `${ledger}/files`);
	await expect(page.getByRole('row', { name: /books\.ledger/ })).toContainText('Ready to review');
});

test('fixes a category in review before the transactions count', async ({
	signedIn: page,
	ledger,
}) => {
	await upload(page, ledger, 'statement.csv');
	await describeStatement(page);
	await page.getByRole('button', { name: 'Continue to review' }).click();

	const draft = page.url();
	await page.getByRole('link', { name: 'UPI GROCER' }).click();
	const panel = page.getByRole('complementary');
	await panel.getByRole('combobox', { name: 'Category' }).fill('Expenses:Groceries');
	await panel.getByLabel(/^Description/).fill('Groceries');
	await panel.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('link', { name: 'Groceries' })).toBeVisible();
	await page.getByRole('link', { name: 'Text', exact: true }).click();
	await expect(page.getByLabel('Ledger file')).toContainText('Expenses:Groceries');

	await visit(page, `${ledger}/transactions`);
	await expect(page.getByRole('rowgroup').filter({ hasText: 'Groceries' })).toHaveCount(0);

	await visit(page, draft);
	await addToLedger(page, 'bank.rupea');
	await visit(page, `${ledger}/transactions`);
	await expect(page.getByRole('rowgroup').filter({ hasText: 'Groceries' })).toContainText(
		'Expenses:Groceries',
	);
});

test('unlocks a statement with its password', async ({ signedIn: page, ledger }) => {
	await upload(page, ledger, 'locked.xls');

	await page.getByLabel('This file has a password').fill('secret');
	await page.getByRole('button', { name: 'Unlock' }).click();
	await expect(page.getByRole('table', { name: 'Statement' })).toContainText('8997.35');
});

test('imports a ledger file as written, naming its upload', async ({ signedIn: page, ledger }) => {
	await upload(page, ledger, { name: 'books.ledger', text: books });
	await page.waitForURL(/\/files\/_\/\d+\/books\.ledger/);
	await expect(page.getByRole('table', { name: 'Transactions found' })).toContainText('Tea');
	await addToLedger(page);
	await expect(page.getByRole('link', { name: 'books.rupea', exact: true })).toBeVisible();

	await visit(page, `${ledger}/files`);
	await page.getByRole('link', { name: 'books.rupea' }).click();
	await expect(page.getByLabel('Ledger file')).toContainText('- statement: ');
	await expect(page.getByLabel('Ledger file')).toContainText('Expenses:Food 10');
});

test('saves, opens and deletes schemas', async ({ signedIn: page, ledger }) => {
	const name = page.getByRole('combobox', { name: 'Name' });
	const schema = page.getByLabel('Schema', { exact: true });
	await upload(page, ledger, 'statement.csv');
	await describeStatement(page);
	await page.getByRole('button', { name: 'Save schema' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	await schema.fill('');
	await page.getByRole('button', { name: 'Start from the example' }).click();
	await expect(schema).not.toHaveValue(/name: Bank/);
	await expect(schema).toHaveValue(/version: v1/);
	await name.click();
	await page.getByRole('option', { name: 'bank.yml', exact: true }).click();
	await expect(schema).toHaveValue(/name: Bank/);

	await page.getByRole('button', { name: 'Delete bank.yml' }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await name.click();
	await expect(page.getByRole('option', { name: 'bank.yml', exact: true })).toHaveCount(0);
});
