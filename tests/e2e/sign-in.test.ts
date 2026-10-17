import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';
import { requestCodeFor } from './support/sign-in.ts';

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

test('a visitor asks for the code again', async ({ page, email }) => {
	await requestCodeFor(page, email);
	await page.getByRole('button', { name: 'Resend code' }).click();
	await expect(page.getByRole('status')).toHaveText('Sent again.');
});

test('a visitor goes back to use a different email', async ({ page, email }) => {
	await requestCodeFor(page, email);
	await page.getByRole('link', { name: 'Use a different email' }).click();
	await expect(page.getByLabel('Email')).toHaveValue('');
});

test('a visitor picks a theme, and it stays after a reload', async ({ page }) => {
	await visit(page, '/sign-in');
	await page.getByRole('button', { name: 'Theme: system' }).click();
	await expect(page.locator(':root')).toHaveAttribute('data-theme', 'light');

	await visit(page, '/sign-in');
	await expect(page.locator(':root')).toHaveAttribute('data-theme', 'light');
	await expect(page.getByRole('button', { name: 'Theme: light' })).toBeVisible();
});
