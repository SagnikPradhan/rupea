import { expect, type Page } from '@playwright/test';

/**
 * Go to `path` and wait for the page to hydrate (the root layout sets
 * `hydrated` on `<html>`). Input typed before then is thrown away when the
 * page takes over, so specs should use this, not `goto`.
 */
export const visit = async (page: Page, path: string) => {
	await page.goto(path);
	await expect(page.locator(':root')).toHaveAttribute('hydrated');
};
