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
	const rows = page.getByRole('row');
	await expect(rows.filter({ hasText: 'UPI GROCER' })).toContainText('-1250.50');
	await expect(rows.filter({ hasText: 'SALARY' })).toContainText('50000');
});
