import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const data = (name: string) => resolve('tests/e2e/data', name);

test('imports a statement into the ledger', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statement').setInputFiles(data('statement.csv'));
	await expect(page.getByRole('table', { name: 'Grid' })).toContainText('UPI GROCER');

	await page.getByLabel('Schema', { exact: true }).fill(await readFile(data('bank.yml'), 'utf8'));
	const draft = page.getByRole('table', { name: 'Draft' });
	await expect(draft.getByRole('row').filter({ hasText: 'UPI GROCER' })).toContainText('-1250.50');
	await expect(page.getByLabel('Save as')).toHaveValue('imports/statement.rupee');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	await page.waitForURL(`**${ledger}/transactions`);
	const transactions = page.getByRole('rowgroup');
	await expect(transactions.filter({ hasText: 'UPI GROCER' })).toContainText('-1,250.50');
	await expect(transactions.filter({ hasText: 'SALARY' })).toContainText('50,000.00');
});

test('unlocks a statement with its password', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statement').setInputFiles(data('locked.xls'));
	await expect(page.getByRole('alert')).toContainText('ExtractionLocked');

	await page.getByLabel('Password for locked.xls').fill('secret');
	await page.getByRole('button', { name: 'Unlock' }).click();
	await expect(page.getByRole('table', { name: 'Grid' })).toContainText('8997.35');
});

test('saves, opens and deletes schemas', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Name', { exact: true }).fill('bank.yml');
	await page.getByLabel('Schema', { exact: true }).fill(await readFile(data('bank.yml'), 'utf8'));
	await page.getByRole('button', { name: 'Save schema' }).click();
	await expect(page.getByRole('button', { name: 'bank.yml', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'New schema' }).click();
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('my-bank.yml');
	await page.getByRole('button', { name: 'bank.yml', exact: true }).click();
	await expect(page.getByLabel('Schema', { exact: true })).toHaveValue(/name: Bank/);

	page.once('dialog', (d) => void d.accept());
	await page.getByRole('button', { name: 'Delete bank.yml' }).click();
	await expect(page.getByRole('button', { name: 'bank.yml', exact: true })).toHaveCount(0);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
});
