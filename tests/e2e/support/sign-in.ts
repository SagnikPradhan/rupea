import type { Page } from '@playwright/test';
import type { Server } from './server.ts';
import { visit } from './visit.ts';

export const signIn = async (page: Page, server: Server, email: string) => {
	await requestCodeFor(page, email);
	await page.getByLabel('Code').fill(await server.codeFor(email));
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => url.pathname !== '/sign-in');
};

export const requestCodeFor = async (page: Page, email: string) => {
	await visit(page, '/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Email me a code' }).click();
	await page.getByLabel('Code').waitFor();
};
