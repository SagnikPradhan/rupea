import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { moveOut } from './support/files.ts';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const data = (name: string) => resolve('tests/e2e/data', name);

const importAs = async (page: Page, ledger: string, key: string) => {
	await visit(page, `${ledger}/import`);
	await page.getByRole('button', { name: 'bank.yml', exact: true }).click();
	await expect(page.getByLabel('Schema', { exact: true })).toHaveValue(/name: Bank/);
	await page.getByLabel('Statements').setInputFiles(data('statement.csv'));
	await expect(page.getByRole('table', { name: 'Draft' })).toContainText('UPI GROCER');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.waitForURL(/files\?file=_%2Fimports/);
	await moveOut(page, key);
};

const importTwice = async (page: Page, ledger: string) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Name', { exact: true }).fill('bank.yml');
	await readFile(data('bank.yml'), 'utf8').then((s) =>
		page.getByLabel('Schema', { exact: true }).fill(s),
	);
	await page.getByRole('button', { name: 'Save schema' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	await importAs(page, ledger, 'imports/aug.rupea');
	await importAs(page, ledger, 'imports/aug-again.rupea');

	await visit(page, `${ledger}/refine?file=imports/aug-again.rupea`);
};

test('reviews the duplicates of a statement imported twice', async ({ signedIn: page, ledger }) => {
	await importTwice(page, ledger);
	await expect(page.getByText('2 possible matches.')).toBeVisible();
	await expect(page.getByRole('article')).toHaveCount(2);
	await page.getByRole('button', { name: 'Accept all 2 duplicates' }).click();
	await expect(page.getByText('No possible matches for imports/aug-again.rupea.')).toBeVisible();

	await visit(page, `${ledger}/postings`);
	await expect(page.getByRole('rowgroup').filter({ hasText: 'UPI GROCER' })).toHaveCount(2);
	await expect(page.getByRole('rowgroup').filter({ hasText: 'SALARY' })).toHaveCount(2);

	await visit(page, `${ledger}/files?file=imports/aug.rupea`);
	const events = page.getByRole('region', { name: 'Events' });
	await expect(events.getByRole('article')).toHaveCount(2);
	const salary = events.getByRole('article').filter({ hasText: 'SALARY' });
	await expect(salary.getByText('Evidence, not counted: imports/aug.rupea')).toBeVisible();

	await salary.getByRole('button', { name: 'Make primary' }).click();
	await expect(salary.getByText('Evidence, not counted: imports/aug-again.rupea')).toBeVisible();
	await expect(page.getByLabel('Ledger file')).toContainText(/SALARY\s*- event: /);

	page.once('dialog', (d) => void d.accept('august-salary'));
	await salary.getByRole('button', { name: 'Rename event' }).click();
	await expect(events.getByRole('article', { name: 'Event august-salary' })).toBeVisible();
	await expect(page.getByLabel('Ledger file')).toContainText('- event: august-salary');
});

test('dismisses one match, and accepts the other with its primary swapped', async ({
	signedIn: page,
	ledger,
}) => {
	await importTwice(page, ledger);
	const matches = page.getByRole('article');
	await expect(matches).toHaveCount(2);

	await matches.first().getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.getByText('1 possible match.')).toBeVisible();

	await matches.getByRole('button', { name: 'Swap primary' }).click();
	await matches.getByRole('button', { name: 'Accept', exact: true }).click();
	await expect(page.getByText('No possible matches for imports/aug-again.rupea.')).toBeVisible();
});
