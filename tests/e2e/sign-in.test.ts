import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

test('a new user signs in with an emailed code', async ({ signedIn, email }) => {
	await visit(signedIn, '/');
	await expect(signedIn.getByText(`Signed in as ${email}`)).toBeVisible();
});

test('a visitor sees the sign-in form', async ({ page }) => {
	await visit(page, '/sign-in');
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	await expect(page.getByLabel('Email')).toBeVisible();
});
