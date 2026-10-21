import { expect, type Page } from '@playwright/test';
import { saveCoverage, startCoverage } from './coverage.ts';

// Input typed before hydration is thrown away, so specs use this, not `goto`.
export const visit = async (page: Page, path: string) => {
	await saveCoverage(page);
	await startCoverage(page);
	await page.goto(path);
	await expect(page.locator(':root')).toHaveAttribute('hydrated');
};
