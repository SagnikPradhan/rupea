/** Signing a page in through the real sign-in form. */
import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { Database } from '#lib/server/db/index.ts';
import { visit } from './visit.ts';

/** The code every test signs in with. */
const CODE = '123456';

/**
 * Sign `page` in as `email`. The server mails a random code, so this swaps in
 * `CODE` once the form has asked for one.
 */
export const signIn = async (page: Page, db: Database, email: string) => {
	const codeHash = createHash('sha256').update(CODE).digest('hex');
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
	await visit(page, '/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Email me a code' }).click();
	await page.getByLabel('Code').waitFor();
	await db.orm.EmailCode.upsert({
		create: { email, codeHash, expiresAt },
		update: { codeHash, expiresAt },
		conflictOn: { email },
	});
	await page.getByLabel('Code').fill(CODE);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => url.pathname !== '/sign-in');
};
