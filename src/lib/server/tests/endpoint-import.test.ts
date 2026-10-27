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
import {
	deleteSchema,
	listSchemas,
	readSchema,
	saveSchema,
} from '#lib/endpoints/schemas.remote.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { bank, statement } from '#services/extraction/tests/fixtures/bank.ts';
import { broken } from '#tests/shared/embedding.ts';
import { signIn, submit } from '#tests/shared/app-server.ts';
import { createLedger, ownerOf } from '#tests/shared/seed.ts';
import { it as base } from '#tests/shared/vitest.ts';
import { describe, expect, vi } from 'vitest';

vi.mock('$app/server', () => import('#tests/shared/app-server.ts'));

/** A ledger its owner is signed in to. */
const it = base.extend<{ ledger: string }>({
	ledger: async ({ db }, use) => {
		const ledger = await createLedger(db);
		signIn(ownerOf(ledger));
		await use(ledger.handle);
		signIn(null);
	},
});

const upload = (handle: string) =>
	submit(uploadStatements, { handle, files: [new File([statement], 'aug.csv')] });

describe('a statement', () => {
	it('is uploaded, read and recognised by a saved schema', ({ context, ledger: handle }) =>
		provide(context, async () => {
			expect(await upload(handle)).toMatchObject({ ok: true });
			expect((await listImports(handle)).ok).toBe(true);

			const [uploaded] = (await listStatements(handle)).data ?? [];
			const key = uploaded?.key ?? '';
			const read = await readStatement({ handle, statement: key });
			expect(read.data?.grid[0]).toEqual(['Account statement']);

			await saveSchema({ handle, ...bank });
			expect(await recogniseStatement({ handle, statement: key })).toMatchObject({
				data: { key: bank.key, builtin: false },
			});
		}));

	it('is previewed and imported with a schema', ({ context, ledger: handle }) =>
		provide({ ...context, models: broken(context.models) }, async () => {
			await upload(handle);
			const [uploaded] = (await listStatements(handle)).data ?? [];
			const key = uploaded?.key ?? '';

			const preview = await previewStatement({ handle, statement: key, schema: bank });
			const imported = await importStatement({ handle, statement: key, schema: bank });
			expect(preview.data?.map((t) => t.description)).toEqual(['UPI GROCER', 'SALARY']);
			expect(imported).toMatchObject({ ok: true, data: { key: expect.stringMatching(/aug/) } });
		}));

	it('is listed and deleted', ({ context, ledger: handle }) =>
		provide(context, async () => {
			await upload(handle);
			const [uploaded] = (await listStatements(handle)).data ?? [];
			const key = uploaded?.key ?? '';

			expect(uploaded).toEqual({ key: expect.stringMatching(/aug\.csv$/), file: null });
			expect(await deleteStatements({ handle, keys: [key] })).toMatchObject({ data: [key] });
			expect(await listStatements(handle)).toMatchObject({ data: [] });
		}));

	it('that is not locked cannot be unlocked', ({ context, ledger: handle }) =>
		provide(context, async () => {
			await upload(handle);
			const [uploaded] = (await listStatements(handle)).data ?? [];
			const statement = uploaded?.key ?? '';

			const unlocked = await submit(unlockStatement, { handle, statement, password: 'x' });
			expect(unlocked).toMatchObject({ ok: false });
		}));
});

describe('a schema', () => {
	it('is saved, read, listed and deleted', ({ context, ledger: handle }) =>
		provide(context, async () => {
			expect(await saveSchema({ handle, ...bank })).toMatchObject({ ok: true });
			expect(await readSchema({ handle, key: bank.key })).toMatchObject({
				data: { content: bank.content },
			});
			expect((await listSchemas(handle)).data).toContainEqual(
				expect.objectContaining({ key: bank.key }),
			);

			expect(await deleteSchema({ handle, key: bank.key })).toMatchObject({ ok: true });
		}));
});
