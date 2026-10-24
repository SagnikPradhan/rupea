import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listFiles } from '#lib/endpoints/files.remote.ts';
import {
	importStatement,
	listImports,
	listInbox,
	previewStatement,
	readStatement,
	recogniseStatement,
	unlockStatement,
	uploadStatements,
} from '#lib/endpoints/import.remote.ts';
import {
	deleteSchema,
	listSchemas,
	readSchema,
	saveSchema,
} from '#lib/endpoints/schemas.remote.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { goto } from '#tests/shared/app-navigation.ts';
import { data } from '#tests/shared/app-state.ts';
import { answer, respond } from '#tests/shared/queries.ts';
import Page from '../+page.svelte';

vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/files.remote.ts', () => ({ listFiles: vi.fn() }));
vi.mock('#lib/endpoints/import.remote.ts', async () => {
	const { fakeForm } = await import('#tests/shared/queries.ts');
	return {
		importStatement: fakeForm(),
		unlockStatement: fakeForm(),
		uploadStatements: fakeForm(),
		listImports: vi.fn(),
		listInbox: vi.fn(),
		previewStatement: vi.fn(),
		readStatement: vi.fn(),
		recogniseStatement: vi.fn(),
	};
});
vi.mock('#lib/endpoints/schemas.remote.ts', () => ({
	deleteSchema: vi.fn(),
	listSchemas: vi.fn(),
	readSchema: vi.fn(),
	saveSchema: Object.assign(vi.fn(), { pending: 0 }),
}));

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

const ok = (d: unknown) => Promise.resolve({ ok: true, data: d, errors: [] });

const grid = [
	['Date', 'Narration', 'Withdrawal Amt.'],
	['03/10/26', 'NEFT', '100.00'],
];

const draft = {
	line: 1,
	date: '2026-10-03',
	time: null,
	description: 'NEFT',
	postings: [{ account: 'Assets:Bank:HDFC', quantity: '-100.00' }],
};

const showing = (jobs: unknown[] = []) => {
	vi.mocked(listSchemas).mockReturnValue(answer([{ key: 'hdfc.yml' }]));
	vi.mocked(listInbox).mockReturnValue(answer([{ key: 'hdfc.xls' }]));
	vi.mocked(listImports).mockReturnValue(answer(jobs));
	vi.mocked(listFiles).mockReturnValue(answer([]));
	vi.mocked(readStatement).mockReturnValue(ok({ key: 'hdfc.xls', grid }) as never);
	vi.mocked(recogniseStatement).mockReturnValue(
		ok({ key: 'hdfc.yml', content: 'name: HDFC' }) as never,
	);
	vi.mocked(previewStatement).mockReturnValue(ok([draft]) as never);
	vi.mocked(readSchema).mockReturnValue(ok({ content: 'name: Saved' }) as never);
	vi.mocked(saveSchema).mockReturnValue(ok({ key: 'hdfc.yml' }) as never);
	vi.mocked(deleteSchema).mockReturnValue(ok(undefined) as never);
	const view = render(Page, { data });
	return { ...view, user: userEvent.setup() };
};

const schema = () => screen.getByLabelText<HTMLTextAreaElement>('Schema');

describe('the import page', () => {
	it('reads a statement into its grid, the schema that knows it, and a draft', async () => {
		const { user } = showing();
		await user.click(await screen.findByRole('button', { name: 'hdfc.xls' }));

		const sheet = await screen.findByRole('table', { name: 'Grid' });
		expect(sheet.querySelector('thead')?.textContent).toBe('ABC');
		expect(schema().value).toBe('name: HDFC');
		expect(await screen.findByText('1 transactions')).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Draft' }).textContent).toContain('Assets:Bank:HDFC');
	});

	it('saves the draft and opens the file it made', async () => {
		const { user } = showing();
		await user.click(await screen.findByRole('button', { name: 'hdfc.xls' }));
		respond(importStatement, { key: 'imports/hdfc.rupee' });
		await user.click(await screen.findByRole('button', { name: 'Save' }));

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/l/h/files?file=imports%2Fhdfc.rupee'));
	});

	it('asks for the password of a locked statement, then reads it', async () => {
		const { user } = showing();
		vi.mocked(readStatement).mockReturnValue(
			Promise.resolve({
				ok: false,
				data: null,
				errors: [fault('ExtractionLocked', { path: 'hdfc.pdf' })],
			}) as never,
		);
		await user.click(await screen.findByRole('button', { name: 'hdfc.xls' }));
		expect(await screen.findByLabelText('Password for hdfc.pdf')).toBeTruthy();

		respond(unlockStatement, { key: 'hdfc.pdf', grid });
		await user.type(screen.getByLabelText('Password for hdfc.pdf'), 'secret');
		await user.click(screen.getByRole('button', { name: 'Unlock' }));
		expect(await screen.findByRole('table', { name: 'Grid' })).toBeTruthy();
		expect(recogniseStatement).toHaveBeenCalledWith({ handle: 'h', statement: 'hdfc.pdf' });
	});

	it('opens a statement uploaded alone', async () => {
		const { user } = showing();
		respond(uploadStatements, [{ key: 'new.xls', queued: false }]);
		await user.upload(await screen.findByLabelText(/^Statements/), new File(['x'], 'new.xls'));

		await waitFor(() =>
			expect(readStatement).toHaveBeenCalledWith({ handle: 'h', statement: 'new.xls' }),
		);
	});

	it('opens, edits, saves and deletes a schema', async () => {
		const { user } = showing();
		await user.click(await screen.findByRole('button', { name: 'hdfc.yml' }));
		await waitFor(() => expect(schema().value).toBe('name: Saved'));

		await fireEvent.input(schema(), { target: { value: 'name: Edited' } });
		await user.click(screen.getByRole('button', { name: 'Save schema' }));
		expect(await screen.findByText('Saved.')).toBeTruthy();
		expect(saveSchema).toHaveBeenCalledWith({
			handle: 'h',
			key: 'hdfc.yml',
			content: 'name: Edited',
		});

		vi.stubGlobal('confirm', () => true);
		await user.click(screen.getByRole('button', { name: 'Delete hdfc.yml' }));
		await waitFor(() => expect(schema().value).toBe(''));
		expect(deleteSchema).toHaveBeenCalledWith({ handle: 'h', key: 'hdfc.yml' });
	});

	it('starts a new schema from the example', async () => {
		const { user } = showing();
		await fireEvent.input(await screen.findByLabelText('Schema'), { target: { value: '' } });
		await user.click(screen.getByRole('button', { name: 'New schema' }));

		expect(schema().value).toContain('name: HDFC Bank savings account');
	});

	it('polls running imports, and shows why one failed', async () => {
		const { unmount } = showing([
			{ id: '1', statement: 'a.xls', status: 'running', error: null },
			{
				id: '2',
				statement: 'b.xls',
				status: 'failed',
				error: fault('CannotReadFile', { path: 'b.xls', reason: 'bad' }),
			},
		]);

		expect(await screen.findByText('CannotReadFile : bad')).toBeTruthy();
		await waitFor(() => expect(listImports).toHaveBeenCalledTimes(2), { timeout: 3000 });
		unmount();
		expect(listFiles).toHaveBeenCalledWith('h');
	});
});
