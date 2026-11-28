import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { visit } from './visit.ts';

/** A file under tests/e2e/data. */
export const data = (name: string) => resolve('tests/e2e/data', name);

/** Drops a statement on the Import statements panel of the files page. */
export const upload = async (
	page: Page,
	ledger: string,
	file: string | { name: string; text: string },
) => {
	await visit(page, `${ledger}/files`);
	const statements = page.getByLabel('Statements', { exact: true });
	if (typeof file === 'string') return statements.setInputFiles(data(file));

	await statements.setInputFiles({
		name: file.name,
		mimeType: 'text/plain',
		buffer: Buffer.from(file.text),
	});
};

/** Describes the statement on screen with the bank's schema from tests/e2e/data. */
export const describeStatement = async (page: Page) => {
	await expect(page.getByRole('region', { name: 'Schema setup' })).toBeVisible();
	await page.getByLabel('Name', { exact: true }).fill('bank.yml');
	await page.getByLabel('Schema', { exact: true }).fill(await readFile(data('bank.yml'), 'utf8'));
	const found = page.getByRole('table', { name: 'Transactions found' });
	await expect(found.getByRole('row').filter({ hasText: 'UPI GROCER' })).toBeVisible();
};

/**
 * Adds the draft in review to the ledger, to the file Rupea suggests unless one
 * is given.
 */
export const addToLedger = async (page: Page, key?: string) => {
	await page.getByRole('button', { name: /^Add \d+ transactions? to ledger$/ }).click();
	if (key) await page.getByLabel('Add to file').fill(key);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(/^Added \d+ to/)).toBeVisible();
};
