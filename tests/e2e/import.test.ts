import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const data = (name: string) => resolve('tests/e2e/data', name);

const books = '2026-08-29 Tea\n\tExpenses:Food 10\n\tAssets:Cash\n';

/** Uploads a statement Rupea does not know and describes it with the bank's format. */
const describeStatement = async (page: Page, ledger: string) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statements').setInputFiles(data('statement.csv'));
	await expect(page.getByRole('heading', { name: 'Describe this statement' })).toBeVisible();
	await expect(page.getByRole('table', { name: 'Statement' })).toContainText('UPI GROCER');

	await page.getByLabel('Name', { exact: true }).fill('bank.yml');
	await readFile(data('bank.yml'), 'utf8').then((s) =>
		page.getByLabel('Format', { exact: true }).fill(s),
	);
	const found = page.getByRole('table', { name: 'Transactions found' });
	await expect(found.getByRole('row').filter({ hasText: 'UPI GROCER' })).toBeVisible();
};

test('reads a statement it learns, and adds it to the ledger', async ({
	signedIn: page,
	ledger,
}) => {
	await describeStatement(page, ledger);
	await page.getByRole('button', { name: 'Add to ledger' }).click();
	await page.getByLabel('Add to file').fill('bank/statement.rupea');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(/^Added \d+ to/)).toBeVisible();

	await visit(page, `${ledger}/transactions`);
	const transactions = page.getByRole('rowgroup');
	await expect(transactions.filter({ hasText: 'UPI GROCER' })).toContainText('-1,250.50');
	await expect(transactions.filter({ hasText: 'SALARY' })).toContainText('50,000.00');
});

test('adds a later statement to the file its account went to, and undoes it', async ({
	signedIn: page,
	ledger,
}) => {
	await describeStatement(page, ledger);
	await page.getByRole('button', { name: 'Save format' }).click();
	await page.getByRole('button', { name: 'Add to ledger' }).click();
	await page.getByLabel('Add to file').fill('bank.rupea');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(/^Added \d+ to/)).toBeVisible();

	const again = (await readFile(data('statement.csv'), 'utf8')) + '\n';
	await visit(page, `${ledger}/import`);
	await page
		.getByLabel('Statements')
		.setInputFiles({ name: 'later.csv', mimeType: 'text/csv', buffer: Buffer.from(again) });
	await page.getByRole('button', { name: 'Add to ledger' }).click();
	await expect(page.getByLabel('Add to file')).toHaveValue('bank.rupea');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Added 0 to')).toContainText('already there');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('button', { name: 'Add to ledger' })).toBeVisible();
	await visit(page, `${ledger}/import`);
	await expect(page.getByRole('row', { name: /later\.csv/ })).toContainText('Ready to add');
});

test('files a draft for review to edit its transactions', async ({ signedIn: page, ledger }) => {
	await describeStatement(page, ledger);
	await page.getByRole('button', { name: 'Edit transactions' }).click();
	await page.waitForURL(/files\?file=_%2Fimports%2F\d{8}%2Fstatement\.rupea$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Not counted');

	await visit(page, `${ledger}/import`);
	await expect(page.getByRole('row', { name: /statement\.csv/ })).toContainText('Ready to add');
});

test('unlocks a statement with its password', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statements').setInputFiles(data('locked.xls'));

	await page.getByLabel('This file has a password').fill('secret');
	await page.getByRole('button', { name: 'Unlock' }).click();
	await expect(page.getByRole('table', { name: 'Statement' })).toContainText('8997.35');
});

test('saves, opens and deletes formats', async ({ signedIn: page, ledger }) => {
	await describeStatement(page, ledger);
	await page.getByRole('button', { name: 'Save format' }).click();
	await expect(page.getByRole('button', { name: 'bank.yml', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'The example' }).click();
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('my-bank.yml');
	await page.getByRole('button', { name: 'bank.yml', exact: true }).click();
	await expect(page.getByLabel('Format', { exact: true })).toHaveValue(/name: Bank/);

	await page.getByRole('button', { name: 'Delete bank.yml' }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByRole('button', { name: 'bank.yml', exact: true })).toHaveCount(0);
});

test('imports a ledger file as written, naming its upload', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page
		.getByLabel('Statements')
		.setInputFiles({ name: 'books.ledger', mimeType: 'text/plain', buffer: Buffer.from(books) });
	await page.waitForURL(/\?statement=/);
	await expect(page.getByRole('table', { name: 'Transactions found' })).toContainText('Tea');

	await page.getByRole('button', { name: 'Add to ledger' }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('link', { name: 'books.rupea' })).toBeVisible();

	await visit(page, `${ledger}/files`);
	await page.getByRole('link', { name: 'books.rupea' }).click();
	await expect(page.getByLabel('Ledger file')).toContainText('- statement: ');
	await expect(page.getByLabel('Ledger file')).toContainText('Expenses:Food 10');
});
