import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const data = (name: string) => resolve('tests/e2e/data', name);

const importAs = async (page: Page, ledger: string, key: string) => {
	await visit(page, `${ledger}/import`);
	await page.getByRole('button', { name: 'bank.yml', exact: true }).click();
	await expect(page.getByLabel('Schema', { exact: true })).toHaveValue(/name: Bank/);
	await page.getByLabel('Statement').setInputFiles(data('statement.csv'));
	await page.getByLabel('Account').fill('Assets:Bank');
	await expect(page.getByRole('table', { name: 'Draft' })).toContainText('UPI GROCER');
	await page.getByLabel('Save as').fill(key);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
};

test('reviews the duplicates of a statement imported twice', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Name', { exact: true }).fill('bank.yml');
	await page.getByLabel('Schema', { exact: true }).fill(await readFile(data('bank.yml'), 'utf8'));
	await page.getByRole('button', { name: 'Save schema' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	await importAs(page, ledger, 'imports/aug.rupee');
	await page.waitForURL(`**${ledger}/transactions`);
	await importAs(page, ledger, 'imports/aug-again.rupee');

	await page.waitForURL(`**${ledger}/refine?file=*`);
	await expect(page.getByText('2 possible matches.')).toBeVisible();
	await expect(page.getByRole('article')).toHaveCount(2);
	await page.getByRole('button', { name: 'Accept all 2 duplicates' }).click();
	await expect(page.getByText('No possible matches for imports/aug-again.rupee.')).toBeVisible();

	await visit(page, `${ledger}/postings`);
	await expect(page.getByRole('row').filter({ hasText: 'UPI GROCER' })).toHaveCount(2);
	await expect(page.getByRole('row').filter({ hasText: 'SALARY' })).toHaveCount(2);

	await visit(page, `${ledger}/files?file=imports/aug.rupee`);
	const events = page.getByRole('region', { name: 'Events' });
	await expect(events.getByRole('article')).toHaveCount(2);
	const salary = events.getByRole('article').filter({ hasText: 'SALARY' });
	await expect(salary.getByText('Evidence, not counted: imports/aug.rupee')).toBeVisible();

	await salary.getByRole('button', { name: 'Make primary' }).click();
	await expect(salary.getByText('Evidence, not counted: imports/aug-again.rupee')).toBeVisible();
	await expect(page.getByLabel('Ledger file')).toHaveValue(/SALARY\n\t- event: /);

	page.once('dialog', (d) => void d.accept('august-salary'));
	await salary.getByRole('button', { name: 'Rename event' }).click();
	await expect(events.getByRole('article', { name: 'Event august-salary' })).toBeVisible();
	await expect(page.getByLabel('Ledger file')).toHaveValue(/- event: august-salary/);
});
