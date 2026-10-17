import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

test('creates a file, edits it, and saves with the keyboard', async ({
	signedIn: page,
	ledger,
}) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill('cash.rupee');
	await page.getByRole('button', { name: 'Create' }).click();

	const files = page.getByRole('navigation', { name: 'Files' });
	await expect(files.getByRole('link', { name: 'cash.rupee' })).toHaveAttribute(
		'aria-current',
		'page',
	);

	await page.getByLabel('Ledger file').click();
	await page.keyboard.type('2026-09-01 TEA\n\tExpenses:Food 20\n\tAssets:Cash\n');
	await expect(page.getByText('Unsaved')).toBeVisible();
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByText('Unsaved')).toBeHidden();

	await visit(page, `${ledger}/transactions`);
	const tea = page.getByRole('rowgroup').filter({ hasText: 'TEA' });
	await expect(tea).toContainText('20.00');

	await tea.getByRole('link', { name: 'cash.rupee:1' }).click();
	await expect(page.locator('.cm-linked')).toHaveText('2026-09-01 TEA');
});

test('renames and deletes a file in place', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill('old.rupee');
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByRole('heading', { name: 'old.rupee' })).toBeVisible();

	await page.getByRole('button', { name: 'Rename' }).click();
	await page.getByLabel('Rename to').fill('new.rupee');
	await page.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByRole('heading', { name: 'new.rupee' })).toBeVisible();

	await page.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('group', { name: 'Confirm delete' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.getByText('Pick a file from the list, or make a new one.')).toBeVisible();
	await expect(page.getByText('No files yet.')).toBeVisible();
});

test('formats a file from the toolbar', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill('messy.rupee');
	await page.getByRole('button', { name: 'Create' }).click();

	await page.getByLabel('Ledger file').click();
	await page.keyboard.type('2026-09-01 TEA\n Expenses:Food    20\n Assets:Cash\n\n\n');
	await page.getByRole('button', { name: 'Format' }).click();

	const lines = page.locator('.cm-line');
	await expect(lines.nth(1)).toHaveText('\tExpenses:Food  20');
	await expect(lines).toHaveCount(4);
});
