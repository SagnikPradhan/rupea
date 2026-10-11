import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { withServer, type Server } from './server.ts';
import { signIn } from './sign-in.ts';

export const test = base.extend<{ email: string; signedIn: Page }, { server: Server }>({
	// Playwright reads the fixtures a test uses from this destructuring.
	server: [({}, use) => withServer(use), { scope: 'worker' }],
	baseURL: ({ server }, use) => use(server.url),
	extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
	email: ({}, use) => use(`${randomUUID()}@example.test`),
	signedIn: async ({ page, server, email }, use) => {
		await signIn(page, server, email);
		await use(page);
	},
});

export { expect };
