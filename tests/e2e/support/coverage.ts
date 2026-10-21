import type { Page } from '@playwright/test';
import { CoverageReport } from 'monocart-coverage-reports';
import options from '../../../mcr.config.ts';

// Under mcr, which records the server, the browser's coverage joins the same report.
const recording = !!process.env['NODE_V8_COVERAGE'];

export const startCoverage = async (page: Page) => {
	if (recording) await page.coverage.startJSCoverage({ resetOnNavigation: false });
};

/** Chromium drops a page's coverage once it loads another, so save it before each load. */
export const saveCoverage = async (page: Page) => {
	if (recording) await new CoverageReport(options).add(await page.coverage.stopJSCoverage());
};
