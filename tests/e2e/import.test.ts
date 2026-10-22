import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { moveOut } from './support/files.ts';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

const data = (name: string) => resolve('tests/e2e/data', name);

const books = '2026-08-29 Tea\n\tExpenses:Food 10\n\tAssets:Cash\n';

test('imports a statement for review, counted once moved out', async ({
	signedIn: page,
	ledger,
}) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statements').setInputFiles(data('statement.csv'));
	await expect(page.getByRole('table', { name: 'Grid' })).toContainText('UPI GROCER');

	await readFile(data('bank.yml'), 'utf8').then((s) =>
		page.getByLabel('Schema', { exact: true }).fill(s),
	);
	const draft = page.getByRole('table', { name: 'Draft' });
	await expect(draft.getByRole('row').filter({ hasText: 'UPI GROCER' })).toContainText('-1250.50');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	await page.waitForURL(/files\?file=_%2Fimports%2F\d{8}%2Fstatement\.rupee$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Not counted');
	await moveOut(page, 'bank/statement.rupee');

	await visit(page, `${ledger}/transactions`);
	const transactions = page.getByRole('rowgroup');
	await expect(transactions.filter({ hasText: 'UPI GROCER' })).toContainText('-1,250.50');
	await expect(transactions.filter({ hasText: 'SALARY' })).toContainText('50,000.00');
});

test('unlocks a statement with its password', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Statements').setInputFiles(data('locked.xls'));
	await expect(page.getByRole('alert')).toContainText('ExtractionLocked');

	await page.getByLabel(/Password for \d{8}\/locked\.xls/).fill('secret');
	await page.getByRole('button', { name: 'Unlock' }).click();
	await expect(page.getByRole('table', { name: 'Grid' })).toContainText('8997.35');
});

test('saves, opens and deletes schemas', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page.getByLabel('Name', { exact: true }).fill('bank.yml');
	await readFile(data('bank.yml'), 'utf8').then((s) =>
		page.getByLabel('Schema', { exact: true }).fill(s),
	);
	await page.getByRole('button', { name: 'Save schema' }).click();
	await expect(page.getByRole('button', { name: 'bank.yml', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'New schema' }).click();
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('my-bank.yml');
	await page.getByRole('button', { name: 'bank.yml', exact: true }).click();
	await expect(page.getByLabel('Schema', { exact: true })).toHaveValue(/name: Bank/);

	page.once('dialog', (d) => void d.accept());
	await page.getByRole('button', { name: 'Delete bank.yml' }).click();
	await expect(page.getByRole('button', { name: 'bank.yml', exact: true })).toHaveCount(0);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
});

test('imports a ledger file as written, naming its upload', async ({ signedIn: page, ledger }) => {
	await visit(page, `${ledger}/import`);
	await page
		.getByLabel('Statements')
		.setInputFiles({ name: 'books.ledger', mimeType: 'text/plain', buffer: Buffer.from(books) });
	await expect(page.getByRole('listitem').filter({ hasText: 'books.ledger:' })).toContainText(
		'succeeded',
	);

	await visit(page, `${ledger}/files`);
	await page.getByRole('link', { name: 'books.rupee' }).click();
	await expect(page.getByLabel('Ledger file')).toContainText('- statement: ');
	await expect(page.getByLabel('Ledger file')).toContainText('Expenses:Food 10');
});
