import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { addToLedger, data, describeStatement, upload } from './support/imports.ts';
import { expect, test } from './support/test.ts';
import { visit } from './support/visit.ts';

test.slow();

/** Imports the same statement to two files, the second time under another name. */
const importTwice = async (page: Page, ledger: string) => {
	await upload(page, ledger, 'statement.csv');
	await describeStatement(page);
	await page.getByRole('button', { name: 'Save schema' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Continue to review' }).click();
	await addToLedger(page, 'imports/aug.rupea');

	const again = (await readFile(data('statement.csv'), 'utf8')) + '\n';
	await upload(page, ledger, { name: 'aug-again.csv', text: again });
	await addToLedger(page, 'imports/aug-again.rupea');
};

const spent = (page: Page) =>
	page
		.getByRole('region', { name: 'Spending figures' })
		.getByText(/^[\d,]+$/)
		.first();

test('accepts the duplicates of a statement imported twice, and the money counts once', async ({
	signedIn: page,
	ledger,
}) => {
	await importTwice(page, ledger);
	await visit(page, `${ledger}/spending`);
	await expect(spent(page)).toHaveText('2,501');

	await visit(page, `${ledger}/refine?file=imports/aug-again.rupea`);
	await expect(page.getByText('2 possible matches.')).toBeVisible();
	await expect(page.getByRole('article')).toHaveCount(2);
	await page.getByRole('button', { name: 'Accept all 2 duplicates' }).click();
	await expect(page.getByText('No possible matches for imports/aug-again.rupea.')).toBeVisible();

	await visit(page, `${ledger}/spending`);
	await expect(spent(page)).toHaveText('1,251');

	await visit(page, `${ledger}/files/imports/aug.rupea`);
	const groups = page.getByRole('region', { name: 'Groups' });
	await expect(groups.getByRole('article')).toHaveCount(2);
	const salary = groups.getByRole('article').filter({ hasText: 'SALARY' });
	await expect(salary.getByText('Evidence, not counted: imports/aug.rupea')).toBeVisible();

	await salary.getByRole('button', { name: 'Make primary' }).click();
	await expect(salary.getByText('Evidence, not counted: imports/aug-again.rupea')).toBeVisible();
	await expect(page.getByLabel('Ledger file')).toContainText(/SALARY\s*- group: /);

	page.once('dialog', (d) => void d.accept('august-salary'));
	await salary.getByRole('button', { name: 'Rename group' }).click();
	await expect(groups.getByRole('article', { name: 'Group august-salary' })).toBeVisible();
	await expect(page.getByLabel('Ledger file')).toContainText('- group: august-salary');
});

test('dismisses one match, and accepts the other with its primary swapped', async ({
	signedIn: page,
	ledger,
}) => {
	await importTwice(page, ledger);
	await visit(page, `${ledger}/refine?file=imports/aug-again.rupea`);
	const matches = page.getByRole('article');
	await expect(matches).toHaveCount(2);

	await matches.first().getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.getByText('1 possible match.')).toBeVisible();

	await matches.getByRole('button', { name: 'Swap primary' }).click();
	await matches.getByRole('button', { name: 'Accept', exact: true }).click();
	await expect(page.getByText('No possible matches for imports/aug-again.rupea.')).toBeVisible();
});
