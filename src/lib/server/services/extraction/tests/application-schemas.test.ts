import { provide } from '#lib/server/shared/context/context.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import { builtinSchemas } from '#services/extraction/adapters/storage-schemas.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import { createLedger } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { bank, folder, schema, upload } from './fixtures/bank';

describe('recognising a statement', () => {
	it("finds the ledger's schema that matches it", ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Schemas.saveSchema({ ledger, ...bank });
			await Schemas.saveSchema({
				ledger,
				key: 'other.yml',
				content: schema.replace('^Account statement$', '^Other bank$'),
			});

			expect(await Schemas.recogniseStatement(ledger, (await upload(ledger)).key)).toEqual(
				ok({ ...bank, builtin: false }),
			);
		}));

	it('says so when none does', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(await Schemas.recogniseStatement(ledger, (await upload(ledger)).key)).toMatchObject({
				error: { type: 'ExtractionUnrecognised', path: 'aug.csv' },
			});
		}));
});

describe('built-in schemas', () => {
	const builtin = (key: string) => ({
		key,
		content: builtinSchemas().find((s) => s.key === key)?.content ?? '',
	});

	it('are the ones Rupee ships, unedited', () => {
		const hdfc = builtin('hdfc-card.yml');
		expect(Schemas.isBuiltin(hdfc)).toBe(true);
		expect(Schemas.isBuiltin({ key: hdfc.key, content: `${hdfc.content}# edited\n` })).toBe(false);
		expect(Schemas.isBuiltin(bank)).toBe(false);
	});

	it("are added without replacing the ledger's own of the same name", ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const hdfc = builtin('hdfc-card.yml');
			const sbi = builtin('sbi-savings.yml');
			await Schemas.saveSchema({ ledger, key: hdfc.key, content: schema });
			await Schemas.addSchema(ledger, hdfc);
			await Schemas.addSchema(ledger, sbi);

			expect(await Schemas.readSchema(ledger, hdfc.key)).toMatchObject(ok({ content: schema }));
			expect(await Schemas.readSchema(ledger, sbi.key)).toMatchObject(ok({ content: sbi.content }));
		}));
});

describe('statement schemas', () => {
	it('are saved, listed and read back', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Schemas.saveSchema({ ledger, key: 'bank.yml', content: schema });
			expect(await Schemas.listSchemas(ledger)).toMatchObject(ok([{ key: 'bank.yml' }]));
			expect(await Schemas.readSchema(ledger, 'bank.yml')).toMatchObject(ok({ content: schema }));
		}));

	it('are refused when they do not parse', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await Schemas.saveSchema({ ledger, key: 'bad.yml', content: 'version: v2' }),
			).toMatchObject({ error: { type: 'ExtractionInvalidSchema', path: 'bad.yml' } });
			expect(await Schemas.listSchemas(ledger)).toEqual(ok([]));
		}));

	it("live in their ledger's folder, apart from other ledgers'", ({ context, db, storage }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const other = await createLedger(db);
			await Schemas.saveSchema({ ledger, key: 'bank.yml', content: schema });

			expect((await storage.read(`${folder(ledger)}/schemas/bank.yml`)).isOk()).toBe(true);
			expect(await Schemas.listSchemas(other)).toEqual(ok([]));
		}));

	it('are deleted', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Schemas.saveSchema({ ledger, key: 'bank.yml', content: schema });
			await Schemas.deleteSchema(ledger, 'bank.yml');

			expect(await Schemas.listSchemas(ledger)).toEqual(ok([]));
		}));
});
