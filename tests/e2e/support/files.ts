import type { Page } from '@playwright/test';

/** Renames the open file, as a reviewer moves an import out of `_/` for the ledger to count it. */
export const moveOut = async (page: Page, to: string) => {
	await page.getByRole('button', { name: 'Rename' }).click();
	await page.getByLabel('Rename to').fill(to);
	await page.getByRole('button', { name: 'Rename' }).click();
	await page.waitForURL(`**?file=${encodeURIComponent(to)}`);
};
