import { createClient } from '#lib/endpoints/api.ts';
import { listFiles } from '#lib/endpoints/files.remote.ts';
import {
	deleteStatements,
	importStatement,
	listImports,
	listStatements,
	previewStatement,
	readStatement,
	recogniseStatement,
	unlockStatement,
	uploadStatements,
} from '#lib/endpoints/import.remote.ts';
import { listSchemas } from '#lib/endpoints/schemas.remote.ts';
import { refreshed, submit, useApi } from '#tests/shared/app-server.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const schema = { key: 'bank.yml', content: 'columns: []' };
const statement = 'statements/2026-09-01/aug.csv';

/**
 * A client of a server that answers every call with this, keeping what it was
 * sent.
 */
const serverAnswering = (answer: unknown) => {
	const seen: Request[] = [];
	const fetch = (request: Request) => {
		seen.push(request);
		return Promise.resolve(Response.json(answer));
	};
	useApi(createClient({ url: 'http://api.test/api', token: 'opaque', fetch }));

	return seen;
};

describe('uploading statements', () => {
	it('forwards each file as a multipart part named files[0], files[1] and on, with its name and bytes', async () => {
		const seen = serverAnswering({ succeeded: [statement], failed: [] });
		const files = [new File(['a,b'], 'aug.csv'), new File([new Uint8Array([1, 2, 3])], 'sep.pdf')];

		const uploaded = await submit(uploadStatements, { handle: 'home', files });

		expect(uploaded).toEqual({ ok: true, data: [statement], errors: [] });
		expect(seen[0]?.url).toBe('http://api.test/api/ledgers/home/statements');
		expect(seen[0]?.headers.get('content-type')).toMatch(/^multipart\/form-data/);

		const form = await seen[0]?.formData();
		const parts = [form?.get('files[0]'), form?.get('files[1]')] as File[];
		expect(parts.map((f) => f.name)).toEqual(['aug.csv', 'sep.pdf']);
		expect(await parts[0]?.text()).toBe('a,b');
		expect(new Uint8Array(await parts[1]!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('lists the statements and imports again, and fails with the files it could not store', async () => {
		const failed = { type: 'StorageInvalidKey', key: 'x' } as const;
		serverAnswering({ succeeded: [statement], failed: [failed] });

		const uploaded = await submit(uploadStatements, {
			handle: 'home',
			files: [new File(['a'], 'aug.csv')],
		});

		expect(uploaded).toEqual({ ok: false, data: [statement], errors: [failed] });
		expect(refreshed()).toEqual([
			{ remote: listStatements, input: 'home' },
			{ remote: listImports, input: 'home' },
		]);
	});

	it('deletes nothing, and calls nothing, for no statements', async () => {
		const deleted = vi.fn();
		useApi({ statements: { delete: deleted } });

		expect(await deleteStatements({ handle: 'home', keys: [] })).toEqual({
			ok: true,
			data: [],
			errors: [],
		});
		expect(deleted).not.toHaveBeenCalled();
	});

	it('refuses a name past 255 bytes, and more than 50 files, before the call', async () => {
		const upload = vi.fn();
		useApi({ statements: { upload } });
		const long = new File(['a'], `${'a'.repeat(256)}.csv`);
		const many = Array.from({ length: 51 }, (_, i) => new File(['a'], `${i}.csv`));

		await expect(submit(uploadStatements, { handle: 'home', files: [long] })).rejects.toThrow(
			'Invalid input',
		);
		await expect(submit(uploadStatements, { handle: 'home', files: many })).rejects.toThrow(
			'Invalid input',
		);
		expect(upload).not.toHaveBeenCalled();
	});

	it('takes at least one file', async () => {
		useApi({});

		await expect(submit(uploadStatements, { handle: 'home', files: [] })).rejects.toThrow(
			'Invalid input',
		);
	});
});

describe('unlocking a statement', () => {
	it('sends the password in the body, not the URL', async () => {
		const seen = serverAnswering({ key: statement, grid: [['Date']] });

		const unlocked = await submit(unlockStatement, {
			handle: 'home',
			statement,
			password: 'hunter2',
		});

		expect(unlocked).toEqual({ ok: true, data: { key: statement, grid: [['Date']] }, errors: [] });
		expect(seen[0]?.url).not.toContain('hunter2');
		expect(await seen[0]?.json()).toMatchObject({ password: 'hunter2' });
	});
});

describe('a statement', () => {
	it('is read, recognised and deleted through the server', async () => {
		const read = vi.fn().mockResolvedValue({ key: statement, grid: [['Account statement']] });
		const recognised = vi.fn().mockResolvedValue({ ...schema, builtin: false });
		const deleted = vi.fn().mockResolvedValue({ succeeded: [statement], failed: [] });
		useApi({ statements: { read, recognise: recognised, delete: deleted } });

		expect((await readStatement({ handle: 'home', statement })).data?.grid).toEqual([
			['Account statement'],
		]);
		expect((await recogniseStatement({ handle: 'home', statement })).data?.builtin).toBe(false);
		expect(await deleteStatements({ handle: 'home', keys: [statement] })).toEqual({
			ok: true,
			data: [statement],
			errors: [],
		});

		expect(read).toHaveBeenCalledWith({ handle: 'home', statement });
		expect(deleted).toHaveBeenCalledWith({ handle: 'home', keys: [statement] });
		expect(refreshed()).toEqual([{ remote: listStatements, input: 'home' }]);
	});

	it('is previewed as text for the page', async () => {
		const draft = {
			file: '_/aug.rupea',
			line: 1,
			date: '2026-08-29',
			time: '09:30:00',
			description: 'UPI GROCER',
			comment: null,
			postings: [
				{
					account: 'Expenses:Food',
					quantity: { amount: '100.00', commodity: 'INR', price: null, cost: null },
				},
			],
		};
		const previewed = vi.fn().mockResolvedValue({ succeeded: [draft], failed: [] });
		useApi({ statements: { preview: previewed } });

		const preview = await previewStatement({ handle: 'home', statement, schema });

		expect(previewed).toHaveBeenCalledWith({ handle: 'home', statement, schema });
		expect(preview.data).toMatchObject([
			{ time: '09:30', postings: [{ account: 'Expenses:Food', quantity: '100.00' }] },
		]);
	});

	it('keeps the failures of a preview beside what it drafted', async () => {
		const failed = { type: 'ParseInvalidPosting', location: 'a.rupea:3' } as const;
		useApi({ statements: { preview: () => Promise.resolve({ succeeded: [], failed: [failed] }) } });

		const preview = await previewStatement({ handle: 'home', statement, schema });

		expect(preview).toEqual({ ok: false, data: [], errors: [failed] });
	});

	it('is imported as a draft, then the files, schemas and statements are listed again', async () => {
		const imported = vi.fn().mockResolvedValue({ key: '_/imports/aug.rupea' });
		useApi({ statements: { import: imported } });

		const reply = await importStatement({ handle: 'home', statement, schema });

		expect(imported).toHaveBeenCalledWith({ handle: 'home', statement, schema });
		expect(reply).toEqual({ ok: true, data: { key: '_/imports/aug.rupea' }, errors: [] });
		expect(refreshed()).toEqual([
			{ remote: listFiles, input: 'home' },
			{ remote: listSchemas, input: 'home' },
			{ remote: listStatements, input: 'home' },
		]);
	});

	it('answers a failed import without listing anything again as if it worked', async () => {
		useApi({ statements: { import: () => Promise.reject(new Error('down')) } });

		const reply = await importStatement({ handle: 'home', statement, schema });

		expect(reply).toMatchObject({ ok: false, data: null, errors: [{ type: 'UnknownError' }] });
	});
});
