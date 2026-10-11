import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

test('a new user signs in with an emailed code, and gets a pet name', async ({ signedIn }) => {
	await visit(signedIn, '/');
	await expect(signedIn.getByText(/^Signed in as [a-z]+-[a-z]+$/)).toBeVisible();
	await expect(signedIn.getByRole('link', { name: 'Personal' })).toBeVisible();
});

test('a visitor sees the sign-in form', async ({ page }) => {
	await visit(page, '/sign-in');
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	await expect(page.getByLabel('Email')).toBeVisible();
});
