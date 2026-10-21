import { test as base, expect, type Page } from '@playwright/test';
import { CoverageReport } from 'monocart-coverage-reports';
import { randomUUID } from 'node:crypto';
import coverage from '../../../mcr.config.ts';
import { withServer, type Server } from './server.ts';
import { signIn } from './sign-in.ts';
import { visit } from './visit.ts';

export const test = base.extend<
	{ email: string; signedIn: Page; ledger: string },
	{ server: Server }
>({
	// Playwright reads the fixtures a test uses from this destructuring.
	server: [({}, use) => withServer(use), { scope: 'worker' }],
	baseURL: ({ server }, use) => use(server.url),
	extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
	// Under mcr, which records the server, the browser's coverage joins the same report.
	page: async ({ page }, use) => {
		if (!process.env['NODE_V8_COVERAGE']) return use(page);

		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		await use(page);
		await new CoverageReport(coverage).add(await page.coverage.stopJSCoverage());
	},
	email: ({}, use) => use(`${randomUUID()}@example.test`),
	signedIn: async ({ page, server, email }, use) => {
		await signIn(page, server, email);
		await use(page);
	},
	// Where the ledger a new user starts with lives, like `/l/quiet-heron`.
	ledger: async ({ signedIn }, use) => {
		await visit(signedIn, '/');
		await signedIn.getByRole('link', { name: 'Personal' }).click();
		await signedIn.waitForURL('**/l/*/transactions');
		await use(new URL(signedIn.url()).pathname.replace(/\/transactions$/, ''));
	},
});

export { expect };
