import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const data = (name: string) => resolve('tests/e2e/data', name);

test('imports a statement into the ledger', async ({ signedIn: page, ledger }) => {
	await visit(page, '/schemas');
	await page.getByLabel('Name', { exact: true }).fill('bank.yml');
	await page.getByLabel('Schema', { exact: true }).fill(await readFile(data('bank.yml'), 'utf8'));
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statement').setInputFiles(data('statement.csv'));
	await page.getByRole('combobox').selectOption('bank.yml');
	await page.getByLabel('Account').fill('Assets:Bank');
	await page.getByRole('button', { name: 'Read statement' }).click();
	await page.getByRole('button', { name: 'Save' }).click();

	await page.waitForURL(`**${ledger}/transactions`);
	const rows = page.getByRole('row');
	await expect(rows.filter({ hasText: 'UPI GROCER' })).toContainText('-1250.50');
	await expect(rows.filter({ hasText: 'SALARY' })).toContainText('50000');
});
