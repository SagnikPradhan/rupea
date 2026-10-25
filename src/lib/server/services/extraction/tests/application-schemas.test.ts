import { provide } from '#lib/server/shared/context/context.ts';
import { ok } from '#lib/server/shared/result/result.ts';
import * as Schemas from '#services/extraction/application/schemas.ts';
import { readRecords } from '#services/extraction/domain/runtime.ts';
import { parseSchema } from '#services/extraction/domain/schema.ts';
import { formatAmount } from '#services/ledger/application/shared.ts';
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

			expect(
				await upload(ledger).then((u) => Schemas.recogniseStatement({ ledger, statement: u.key })),
			).toEqual(ok({ ...bank, builtin: false }));
		}));

	it('says so when none does', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			expect(
				await upload(ledger).then((u) => Schemas.recogniseStatement({ ledger, statement: u.key })),
			).toMatchObject({
				error: { type: 'ExtractionUnrecognised', path: 'aug.csv' },
			});
		}));
});

const amounts = (content: string) =>
	readRecords({
		schema: parseSchema('hdfc-card.yml', content)._unsafeUnwrap(),
		file: 'card.xls',
		grid: [
			['Date & Time', 'Description', 'AMT', '', '', 'Debit / Credit'],
			['15/08/2026 / 18:41', 'UPI-CITY CAFE', '195.00', '', '', ''],
			['15/08/2026 / 19:02', 'CREDIT CARD PAYMENT', '7,073.00', '', '', 'Cr'],
		],
	})
		._unsafeUnwrap()
		.succeeded.map((r) => formatAmount(r.amount));

describe('built-in schemas', () => {
	const builtin = (key: string) => ({
		key,
		content: Schemas.builtinSchemas().find((s) => s.key === key)?.content ?? '',
	});

	it.each(Schemas.builtinSchemas())('$key parses and names its account', ({ key, content }) => {
		expect(parseSchema(key, content)._unsafeUnwrap().account).toMatch(/^(Assets|Liabilities):/);
	});

	it('reads an HDFC card credit by its Cr mark, which comes before the amount spent', () => {
		const content = builtin('hdfc-card.yml').content;
		const credit = '    - from: [text: Cr, left: 3]\n      pipe: [number]\n';
		const spent = '    - from: [header: AMT]\n      pipe: [number, negate]\n';

		expect(amounts(content)).toEqual(['-195.00', '7073.00']);
		expect(amounts(content.replace(credit + spent, spent + credit))).toEqual([
			'-195.00',
			'-7073.00',
		]);
	});

	it('are the ones Rupea ships, unedited', () => {
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
			await Schemas.addSchema({ ledger, schema: hdfc });
			await Schemas.addSchema({ ledger, schema: sbi });

			expect(await Schemas.readSchema({ ledger, key: hdfc.key })).toMatchObject(
				ok({ content: schema }),
			);
			expect(await Schemas.readSchema({ ledger, key: sbi.key })).toMatchObject(
				ok({ content: sbi.content }),
			);
		}));
});

describe('statement schemas', () => {
	it('are saved, listed and read back', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			await Schemas.saveSchema({ ledger, key: 'bank.yml', content: schema });
			expect(await Schemas.listSchemas(ledger)).toMatchObject(ok([{ key: 'bank.yml' }]));
			expect(await Schemas.readSchema({ ledger, key: 'bank.yml' })).toMatchObject(
				ok({ content: schema }),
			);
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
			await Schemas.deleteSchema({ ledger, key: 'bank.yml' });

			expect(await Schemas.listSchemas(ledger)).toEqual(ok([]));
		}));
});
