import { expect, type Page } from '@playwright/test';
import { visit } from './visit.ts';

/** Creates a ledger file through the editor and saves it with this content. */
export const createFile = async (page: Page, ledger: string, key: string, content: string) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill(key);
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByRole('heading', { name: key })).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Breadcrumb' })
		.getByRole('link', { name: 'Files' })
		.click();
	await page.getByRole('link', { name: key }).click();
	await page.getByLabel('Ledger file').fill(content);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Unsaved')).toBeHidden();
};
