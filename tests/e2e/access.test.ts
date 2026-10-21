import { randomUUID } from 'node:crypto';
import { expect, test } from './support/test.ts';
import { signIn } from './support/sign-in.ts';
import { visit } from './support/visit.ts';

test('a user cannot open someone else’s ledger', async ({ ledger, browser, server }) => {
	const context = await browser.newContext({
		baseURL: server.url,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
	});
	const stranger = await context.newPage();
	await signIn(stranger, server, `${randomUUID()}@example.test`);

	const response = await stranger.goto(`${ledger}/transactions`);
	expect(response?.status()).toBe(404);
	await context.close();
});

test('signing out ends the session', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/transactions`);
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL('**/sign-in');

	await page.goto(`${ledger}/transactions`);
	await expect(page).toHaveURL(/\/sign-in$/);
});
