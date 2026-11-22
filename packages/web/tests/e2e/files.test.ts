import { expect, test } from './support/test.ts';
import { startFile } from './support/files.ts';
import { visit } from './support/visit.ts';

test('creates a file, edits it, and saves with the keyboard', async ({
	signedIn: page,
	ledger,
}) => {
	await startFile(page, ledger, 'cash.rupea');
	await page.getByRole('link', { name: 'All files' }).click();
	await page.getByRole('link', { name: 'cash.rupea' }).click();

	await page.getByLabel('Ledger file').click();
	await page.keyboard.type('2026-09-01 TEA\n\tExpenses:Food 20\n\tAssets:Cash\n');
	await expect(page.getByText('Unsaved')).toBeVisible();
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByText('Unsaved')).toBeHidden();

	await visit(page, `${ledger}/transactions`);
	const tea = page.getByRole('rowgroup').filter({ hasText: 'TEA' });
	await expect(tea).toContainText('20');

	await visit(page, `${ledger}/files/cash.rupea?line=1`);
	await expect(page.locator('.cm-linked')).toHaveText('2026-09-01 TEA');
});

test('renames and deletes a file in place', async ({ signedIn: page, ledger }) => {
	await startFile(page, ledger, 'old.rupea');

	await page.getByRole('button', { name: 'Rename' }).click();
	await page.getByLabel('Rename to').fill('new.rupea');
	await page.getByRole('button', { name: 'Rename' }).click();
	await expect(page.locator('h1 + p', { hasText: 'new.rupea' })).toBeVisible();

	await page.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('group', { name: 'Confirm delete' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.getByText('No files yet.')).toBeVisible();
});

test('formats a file from the toolbar', async ({ signedIn: page, ledger }) => {
	await startFile(page, ledger, 'messy.rupea');

	await page.getByLabel('Ledger file').click();
	await page.keyboard.type('2026-09-01 TEA\n Expenses:Food    20\n Assets:Cash\n\n\n');
	await page.getByRole('button', { name: 'Format' }).click();

	const lines = page.locator('.cm-line');
	await expect(lines.nth(1)).toHaveText('\tExpenses:Food  20.00');
	await expect(lines.nth(2)).toHaveText('\tAssets:Cash');
	await expect(lines).toHaveCount(4);
});

test('finds and replaces text with the keyboard', async ({ signedIn: page, ledger }) => {
	await startFile(page, ledger, 'tea.rupea');

	await page.getByLabel('Ledger file').click();
	await page.keyboard.type('2026-09-01 TEA\n\tExpenses:Food 20\n\tAssets:Cash\n');
	await page.keyboard.press('ControlOrMeta+f');
	await page.getByRole('textbox', { name: 'Find' }).fill('Assets:Cash');
	await page.getByRole('textbox', { name: 'Replace' }).fill('Assets:Wallet');
	await page.getByRole('button', { name: 'Replace all' }).click();

	await expect(page.locator('.cm-line').nth(2)).toHaveText('\tAssets:Wallet');
	await expect(page.getByText('Unsaved')).toBeVisible();
});

test('asks before leaving unsaved changes, and stays when told to', async ({
	signedIn: page,
	ledger,
}) => {
	await startFile(page, ledger, 'draft.rupea');
	await page.getByLabel('Ledger file').click();
	await page.keyboard.type('2026-09-01 TEA');

	const files = page.getByRole('link', { name: 'All files' });

	const [stay] = await Promise.all([
		page.waitForEvent('dialog'),
		files.click({ noWaitAfter: true }),
	]);
	await stay.dismiss();
	await expect(page.getByText('Unsaved')).toBeVisible();

	const [leave] = await Promise.all([
		page.waitForEvent('dialog'),
		files.click({ noWaitAfter: true }),
	]);
	await leave.accept();
	await expect(page.getByRole('link', { name: 'draft.rupea' })).toBeVisible();
});

test('moves and deletes many files at once', async ({ signedIn: page, ledger }) => {
	await startFile(page, ledger, 'in/a.rupea');
	await startFile(page, ledger, 'in/b.rupea');
	await startFile(page, ledger, 'c.rupea');

	await visit(page, `${ledger}/files`);
	const table = async () => (await page.getByRole('table').boundingBox())?.y;
	const top = await table();
	await page.getByLabel('Select in/', { exact: true }).check();
	expect(await table()).toBe(top);
	await page.getByRole('button', { name: 'Move' }).click();
	expect(await table()).toBe(top);
	await page.getByLabel('Move 2 files to').fill('bank');
	await page.getByRole('button', { name: 'Move' }).click();
	await expect(page.getByLabel('Select bank/a.rupea')).toBeVisible();
	await expect(page.getByLabel('Select in/', { exact: true })).toBeHidden();

	await page.getByRole('button', { name: 'bank/' }).click();
	await expect(page.getByLabel('Select bank/a.rupea')).toBeHidden();

	await page.getByLabel('Select all files').check();
	await page.getByRole('button', { name: 'Delete' }).click();
	expect(await table()).toBe(top);
	await page
		.getByRole('group', { name: 'Confirm delete' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.getByText('No files yet.')).toBeVisible();
});
