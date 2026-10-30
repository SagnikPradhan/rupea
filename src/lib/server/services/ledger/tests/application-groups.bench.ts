import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import * as Groups from '#services/ledger/application/groups.ts';
import { cloneFixture, timed } from '#tests/shared/fixtures.ts';
import { it } from '#tests/shared/vitest.ts';
import { describe } from 'vitest';

const LEDGERS = ['fifty-years', 'wide'];

describe('groups', () => {
	it.for(LEDGERS)('over %s', { timeout: 3_600_000 }, async (name, { bench, models }) => {
		const { ledger, context } = await cloneFixture(name, models);

		const listed = await provide(context, () => Files.listFiles(ledger));
		const keys = listed._unsafeUnwrap().succeeded.map((f) => f.key);
		const oldest = keys.find((k) => k !== 'opening.rupea') ?? '';
		const newest = keys.at(-1) ?? '';

		const candidates = (f: string) =>
			timed(context, () => Groups.listCandidates({ ledger, file: f }));
		const groups = (f: string) => timed(context, () => Groups.listGroups({ ledger, file: f }));

		await bench.compare(
			bench('candidates in newest', candidates(newest)),
			bench('candidates in oldest', candidates(oldest)),
			bench('groups in newest', groups(newest)),
			bench('groups in oldest', groups(oldest)),
			{ iterations: 10, time: 0, warmupIterations: 1 },
		);
	});
});
