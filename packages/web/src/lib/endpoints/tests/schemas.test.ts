import { ORPCError } from '@orpc/client';
import {
	deleteSchema,
	listSchemas,
	readSchema,
	saveSchema,
} from '#lib/endpoints/schemas.remote.ts';
import { refreshed, useApi } from '#tests/shared/app-server.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

const file = {
	key: 'bank.yml',
	size: 11,
	modified: '2026-09-01T09:30:00Z',
	version: 'v1',
	content: 'columns: []',
};

describe('a schema', () => {
	it('is read and listed without anything being listed again', async () => {
		const read = vi.fn().mockResolvedValue(file);
		useApi({ readSchema: read, listSchemas: () => Promise.resolve([file]) });

		await readSchema({ handle: 'home', key: 'bank.yml' });
		await listSchemas('home');

		expect(read).toHaveBeenCalledWith({ handle: 'home', key: 'bank.yml' });
		expect(refreshed()).toEqual([]);
	});

	it('is saved and deleted, and the schemas are listed again each time', async () => {
		const saved = vi.fn().mockResolvedValue(file);
		const deleted = vi.fn().mockResolvedValue(undefined);
		useApi({ saveSchema: saved, deleteSchema: deleted });

		const reply = await saveSchema({ handle: 'home', key: 'bank.yml', content: file.content });
		await deleteSchema({ handle: 'home', key: 'bank.yml' });

		expect(reply).toEqual({ ok: true, data: file, errors: [] });
		expect(saved).toHaveBeenCalledWith({ handle: 'home', key: 'bank.yml', content: file.content });
		expect(deleted).toHaveBeenCalledWith({ handle: 'home', key: 'bank.yml' });
		expect(refreshed()).toEqual([
			{ remote: listSchemas, input: 'home' },
			{ remote: listSchemas, input: 'home' },
		]);
	});

	it('is saved under the key as it was typed, trimmed', async () => {
		const saved = vi.fn().mockResolvedValue(file);
		useApi({ saveSchema: saved });

		await saveSchema({ handle: 'home', key: '  bank.yml ', content: '' });

		expect(saved).toHaveBeenCalledWith({ handle: 'home', key: 'bank.yml', content: '' });
	});

	it('refuses a key that is not a schema', async () => {
		useApi({});

		await expect(readSchema({ handle: 'home', key: 'bank.yaml' })).rejects.toThrow('Invalid input');
	});

	it('answers a save the server refused as the reply', async () => {
		const invalid = { type: 'ExtractionInvalidSchema', path: 'bank.yml', reason: 'bad' } as const;
		const refused = new ORPCError('UNPROCESSABLE', { status: 422, defined: true, data: invalid });
		useApi({ saveSchema: () => Promise.reject(refused) });

		const reply = await saveSchema({ handle: 'home', key: 'bank.yml', content: 'x' });

		expect(reply).toEqual({ ok: false, data: null, errors: [invalid] });
	});
});
