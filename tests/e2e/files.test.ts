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

	await expect(page.getByRole('heading', { name: 'cash.rupee' })).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Breadcrumb' })
		.getByRole('link', { name: 'Files' })
		.click();
	await page.getByRole('link', { name: 'cash.rupee' }).click();

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

test('asks before leaving unsaved changes, and stays when told to', async ({
	signedIn: page,
	ledger,
}) => {
	await visit(page, `${ledger}/files`);
	await page.getByRole('button', { name: 'New file' }).click();
	await page.getByLabel('New file').fill('draft.rupee');
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByLabel('Ledger file').click();
	await page.keyboard.type('2026-09-01 TEA');

	const files = page
		.getByRole('navigation', { name: 'Breadcrumb' })
		.getByRole('link', { name: 'Files' });

	const [kept] = await Promise.all([page.waitForEvent('dialog'), files.click()]);
	await kept.dismiss();
	await expect(page.getByText('Unsaved')).toBeVisible();

	const [discarded] = await Promise.all([page.waitForEvent('dialog'), files.click()]);
	await discarded.accept();
	await expect(page.getByRole('link', { name: 'draft.rupee' })).toBeVisible();
});

test('moves and deletes many files at once', async ({ signedIn: page, ledger }) => {
	const create = async (key: string) => {
		await visit(page, `${ledger}/files`);
		await page.getByRole('button', { name: 'New file' }).click();
		await page.getByLabel('New file').fill(key);
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page.getByRole('heading', { name: key })).toBeVisible();
	};
	await create('_/a.rupee');
	await create('_/b.rupee');
	await create('c.rupee');

	await visit(page, `${ledger}/files`);
	const table = async () => (await page.getByRole('table').boundingBox())?.y;
	const top = await table();
	await page.getByLabel('Select _/', { exact: true }).check();
	expect(await table()).toBe(top);
	await page.getByRole('button', { name: 'Move' }).click();
	expect(await table()).toBe(top);
	await page.getByLabel('Move 2 files to').fill('bank');
	await page.getByRole('button', { name: 'Move' }).click();
	await expect(page.getByLabel('Select bank/a.rupee')).toBeVisible();
	await expect(page.getByLabel('Select _/', { exact: true })).toBeHidden();

	await page.getByRole('button', { name: 'bank/' }).click();
	await expect(page.getByLabel('Select bank/a.rupee')).toBeHidden();

	await page.getByLabel('Select all files').check();
	await page.getByRole('button', { name: 'Delete' }).click();
	expect(await table()).toBe(top);
	await page
		.getByRole('group', { name: 'Confirm delete' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.getByText('No files yet.')).toBeVisible();
});
