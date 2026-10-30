import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { cloneFixture, timed } from '#tests/shared/fixtures.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe } from 'vitest';

const LEDGERS = ['fifty-years', 'wide'];
const STATEMENT = 100;

describe('files', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);

		const listed = await provide(context, () => Files.listFiles(ledger));
		const keys = listed._unsafeUnwrap().succeeded.map((f) => f.key);
		const oldest = keys.find((k) => k !== 'opening.rupea') ?? '';
		const newest = keys.at(-1) ?? '';
		const edits: number[] = [];
		const imports: number[] = [];

		const edit = (key: string) =>
			timed(context, () =>
				Files.readFile({ ledger, key }).andThen((f) =>
					Files.editFile({
						ledger,
						key,
						version: f.version,
						content: `${f.content}\n${entryOf(edits.push(edits.length))}`,
					}),
				),
			);
		const read = (k: string) => timed(context, () => Files.readFile({ ledger, key: k }));
		const list = timed(context, () => Files.listFiles(ledger));
		const imported = timed(context, () =>
			Files.importFile({ ledger, key: 'statement.rupea', content: statementOf(imports.push(0)) }),
		);

		await bench.compare(
			bench('list files', list),
			bench('read newest', read(newest)),
			bench('edit newest', edit(newest)),
			bench('edit oldest', edit(oldest)),
			bench(`import ${STATEMENT}`, imported),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});

const entryOf = (n: number) =>
	`2026-10-21 Bench edit ${n}\n\tExpenses:Bench ${n + 1}\n\tAssets:Bank\n`;

const statementOf = (n: number) =>
	Array.from({ length: STATEMENT }, (_, i) => entryOf(n * STATEMENT + i)).join('\n');
