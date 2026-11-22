import { expect, type Page } from '@playwright/test';
import { visit } from './visit.ts';

/** Creates an empty ledger file from the New file button of the files list. */
export const startFile = async (page: Page, ledger: string, key: string) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('link', { name: 'New file' }).click();
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill(key);
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.locator('h1 + p', { hasText: key })).toBeVisible();
};

/** Creates a ledger file through the editor and saves it with this content. */
export const createFile = async (page: Page, ledger: string, key: string, content: string) => {
	await startFile(page, ledger, key);
	await page.getByRole('link', { name: 'All files' }).click();
	await page.getByRole('link', { name: key }).click();
	await page.getByLabel('Ledger file').fill(content);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Unsaved')).toBeHidden();
};
