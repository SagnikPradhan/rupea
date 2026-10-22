import { expect, type Page } from '@playwright/test';
import { visit } from './visit.ts';

/** Renames the open file, as a reviewer moves an import out of `_/` for the ledger to count it. */
export const moveOut = async (page: Page, to: string) => {
	await page.getByRole('button', { name: 'Rename' }).click();
	await page.getByLabel('Rename to').fill(to);
	await page.getByRole('button', { name: 'Rename' }).click();
	await page.waitForURL(`**?file=${encodeURIComponent(to)}`);
};

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
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
};
