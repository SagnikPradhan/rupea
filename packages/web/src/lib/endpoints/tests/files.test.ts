import { ORPCError } from '@orpc/client';
import {
	addFile,
	createFile,
	createTransaction,
	deleteFiles,
	deleteTransaction,
	editFile,
	findLatestFile,
	findTransaction,
	formatFile,
	listFiles,
	parseFile,
	readFile,
	renameFiles,
	saveTransaction,
} from '#lib/endpoints/files.remote.ts';
import { listProblems } from '#lib/endpoints/ledger.remote.ts';
import { refreshed, useApi } from '#tests/shared/app-server.ts';
import type { TransactionForm } from '@rupea/shared/forms.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const handle = 'home';
const content = '2026-08-29 Groceries\n\tExpenses:Food 100\n\tAssets:Bank\n';
const file = { key: 'a.rupea', size: 50, modified: '2026-09-01T09:30:00Z', version: 'v1', content };
const filesAndProblems = [
	{ remote: listFiles, input: handle },
	{ remote: listProblems, input: handle },
];

const form: TransactionForm = {
	file: 'a.rupea',
	date: '2026-08-29',
	time: '',
	description: 'Groceries',
	comment: '',
	metadata: [],
	postings: [],
};

describe('a ledger file', () => {
	it('is created, edited, moved and deleted, and the files and problems are listed again', async () => {
		const created = vi.fn().mockResolvedValue(file);
		const edited = vi.fn().mockResolvedValue(file);
		const moved = vi.fn().mockResolvedValue({ succeeded: [file], failed: [] });
		const deleted = vi.fn().mockResolvedValue({ succeeded: ['b.rupea'], failed: [] });
		useApi({ files: { create: created, edit: edited, rename: moved, delete: deleted } });
		const moves = [{ from: 'a.rupea', to: 'b.rupea' }];

		expect(await createFile({ handle, key: 'a.rupea', content })).toMatchObject({ ok: true });
		expect(await editFile({ handle, key: 'a.rupea', content, version: 'v1' })).toMatchObject({
			ok: true,
		});
		expect(await renameFiles({ handle, moves })).toEqual({ ok: true, data: [file], errors: [] });
		expect(await deleteFiles({ handle, keys: ['b.rupea'] })).toEqual({
			ok: true,
			data: ['b.rupea'],
			errors: [],
		});

		expect(created).toHaveBeenCalledWith({ handle, key: 'a.rupea', content });
		expect(edited).toHaveBeenCalledWith({ handle, key: 'a.rupea', content, version: 'v1' });
		expect(moved).toHaveBeenCalledWith({ handle, moves });
		expect(deleted).toHaveBeenCalledWith({ handle, keys: ['b.rupea'] });
		expect(refreshed()).toEqual([
			...filesAndProblems,
			...filesAndProblems,
			...filesAndProblems,
			...filesAndProblems,
		]);
	});

	it('keeps the files that moved beside the one whose name was taken', async () => {
		const taken = { type: 'NameTaken', name: 'b.rupea' } as const;
		useApi({ files: { rename: () => Promise.resolve({ succeeded: [file], failed: [taken] }) } });
		const moves = [
			{ from: 'a.rupea', to: 'c.rupea' },
			{ from: 'd.rupea', to: 'b.rupea' },
		];

		expect(await renameFiles({ handle, moves })).toEqual({
			ok: false,
			data: [file],
			errors: [taken],
		});
	});

	it('is read without the lists being touched', async () => {
		const read = vi.fn().mockResolvedValue(file);
		useApi({ files: { read } });

		expect((await readFile({ handle, key: 'a.rupea' })).data).toEqual(file);
		expect(read).toHaveBeenCalledWith({ handle, key: 'a.rupea' });
		expect(refreshed()).toEqual([]);
	});

	it('is refused as the failure it was saved over when it changed meanwhile', async () => {
		const conflict = {
			type: 'StorageConflict',
			key: 'a.rupea',
			expected: 'v1',
			actual: 'v2',
		} as const;
		const refused = new ORPCError('CONFLICT', { status: 409, defined: true, data: conflict });
		useApi({ files: { edit: () => Promise.reject(refused) } });

		const edited = await editFile({ handle, key: 'a.rupea', content, version: 'v1' });

		expect(edited).toEqual({ ok: false, data: null, errors: [conflict] });
		expect(refreshed()).toEqual(filesAndProblems);
	});

	it('is added to the file its account was last added to', async () => {
		const addition = { file, added: 1, skipped: 0, before: null, draft: content };
		const added = vi.fn().mockResolvedValue(addition);
		useApi({ files: { add: added, findLatest: () => Promise.resolve('hdfc.rupea') } });

		const latest = await findLatestFile({ handle, account: 'Assets:Bank' });
		const reply = await addFile({ handle, from: '_/sep.rupea', to: latest.data ?? '' });

		expect(added).toHaveBeenCalledWith({ handle, from: '_/sep.rupea', to: 'hdfc.rupea' });
		expect(reply).toEqual({ ok: true, data: addition, errors: [] });
		expect(refreshed()).toEqual(filesAndProblems);
	});

	it('refuses a name that is not a ledger file', async () => {
		useApi({});

		await expect(createFile({ handle, key: 'notes.txt', content })).rejects.toThrow(
			'Invalid input',
		);
	});

	it('does nothing, and calls nothing, for no names at all', async () => {
		const called = vi.fn();
		useApi({ files: { delete: called, rename: called } });
		const nothing = { ok: true, data: [], errors: [] };

		expect(await deleteFiles({ handle, keys: [] })).toEqual(nothing);
		expect(await renameFiles({ handle, moves: [] })).toEqual(nothing);
		expect(called).not.toHaveBeenCalled();
	});
});

describe('a draft', () => {
	it('is tidied and parsed in the ledger without being saved', async () => {
		const formatted = vi.fn().mockResolvedValue('tidy');
		const draft = {
			file: 'a.rupea',
			line: 1,
			date: '2026-08-29',
			time: '09:30:00',
			description: 'Groceries',
			comment: null,
			postings: [],
		};
		const parsed = vi.fn().mockResolvedValue({ succeeded: [draft], failed: [] });
		useApi({ files: { format: formatted, parse: parsed } });

		expect(await formatFile({ handle, content })).toEqual({ ok: true, data: 'tidy', errors: [] });
		const reply = await parseFile({ handle, key: 'a.rupea', content });

		expect(formatted).toHaveBeenCalledWith({ handle, content });
		expect(parsed).toHaveBeenCalledWith({ handle, key: 'a.rupea', content });
		expect(reply.data).toMatchObject([{ description: 'Groceries', time: '09:30' }]);
		expect(refreshed()).toEqual([]);
	});

	it('is parsed with the errors that were found beside what could be read', async () => {
		const bad = { type: 'ParseInvalidPosting', location: 'a.rupea:3' } as const;
		useApi({ files: { parse: () => Promise.resolve({ succeeded: [], failed: [bad] }) } });

		const reply = await parseFile({ handle, key: 'a.rupea', content });

		expect(reply).toEqual({ ok: false, data: [], errors: [bad] });
	});

	it('is refused when it is longer than a draft may be', async () => {
		useApi({});

		await expect(formatFile({ handle, content: 'x'.repeat(1024 * 1024 + 1) })).rejects.toThrow(
			'Invalid input',
		);
	});
});

describe('a transaction', () => {
	it('is created, saved and deleted, and the files and problems are listed again', async () => {
		const position = { file: 'a.rupea', line: 1 };
		const created = vi.fn().mockResolvedValue(position);
		const saved = vi.fn().mockResolvedValue(position);
		const deleted = vi.fn().mockResolvedValue(undefined);
		useApi({ transactions: { create: created, save: saved, delete: deleted } });

		expect(await createTransaction({ handle, form })).toEqual({
			ok: true,
			data: position,
			errors: [],
		});
		await saveTransaction({ handle, ...position, version: 'v1', form });
		await deleteTransaction({ handle, ...position, version: 'v1' });

		expect(created).toHaveBeenCalledWith({ handle, form });
		expect(saved).toHaveBeenCalledWith({ handle, ...position, version: 'v1', form });
		expect(deleted).toHaveBeenCalledWith({ handle, ...position, version: 'v1' });
		expect(refreshed()).toEqual([...filesAndProblems, ...filesAndProblems, ...filesAndProblems]);
	});

	it('is found as the form it was written from', async () => {
		const found = { file: 'a.rupea', line: 1, version: 'v1', form };
		const finder = vi.fn().mockResolvedValue(found);
		useApi({ transactions: { find: finder } });
		const id = '0196f4a2-7c1e-7000-8000-000000000001';

		expect(await findTransaction({ handle, id })).toEqual({ ok: true, data: found, errors: [] });
		expect(finder).toHaveBeenCalledWith({ handle, id });
	});

	it('is not found with an id that is not one, without asking the API', async () => {
		const finder = vi.fn();
		useApi({ transactions: { find: finder } });

		expect(await findTransaction({ handle, id: 'new' })).toEqual({
			ok: false,
			data: null,
			errors: [{ type: 'TransactionNotFound', path: 'new', line: 0 }],
		});
		expect(finder).not.toHaveBeenCalled();
	});

	it('is refused when its boxes are not filled in', async () => {
		useApi({});

		await expect(createTransaction({ handle, form: { ...form, description: '' } })).rejects.toThrow(
			'Invalid input',
		);
	});
});
