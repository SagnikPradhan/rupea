import { connectDatabase } from '#lib/server/db/index.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import type { Models } from '#lib/server/shared/onnx/runtime.ts';
import type { ResultAsync } from '#lib/server/shared/result/result.ts';
import { localStorage } from '#lib/server/shared/storage/local.ts';
import * as Files from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { inject, onTestFinished } from 'vitest';
import { createTestContext } from './context.ts';
import { admin, at, TEMPLATE } from './database.ts';
import { createLedger } from './seed.ts';

const LEDGERS = resolve('tests/fixtures/ledgers');
const LOCK = 20261021;
const SEEDED = 'ledger.json';

/**
 * A copy of a ledger that `pnpm fixtures` wrote, with its own database and storage.
 *
 * The first copy of a name in a run seeds it, and every copy after, in this worker or another, clones that.
 */
export const cloneFixture = async (name: string, models: Models) => {
	const server = inject('postgres');
	const seeded = join(inject('fixtures'), name);
	const source = `fixture_${name.replaceAll('-', '_')}`;
	const copy = `test_${randomUUID().replaceAll('-', '')}`;
	const root = await mkdtemp(join(tmpdir(), 'rupea-'));

	await locked(server, async () => {
		await seed({ server, name, source, seeded, models });
		await admin(server, `create database ${copy} template ${source}`);
	});
	await cp(join(seeded, 'storage'), root, { recursive: true });

	const handle = await connectDatabase(at(server, copy));
	onTestFinished(async () => {
		await handle.close();
		await admin(server, `drop database ${copy}`);
		await rm(root, { recursive: true, force: true });
	});

	const ledger: Ledger = JSON.parse(await readFile(join(seeded, SEEDED), 'utf8'));
	return {
		ledger,
		db: handle.db,
		context: createTestContext(handle.db, localStorage(root), models),
	};
};

/** What a benchmark times: the call inside the context, failing the run when it fails. */
export const timed =
	<T>(context: ReturnType<typeof createTestContext>, f: () => ResultAsync<T>) =>
	() =>
		provide(context, f).then((r) => void r._unsafeUnwrap());

type SeedOptions = { server: string; name: string; source: string; seeded: string; models: Models };

const seed = async ({ server, name, source, seeded, models }: SeedOptions) => {
	if (
		await readFile(join(seeded, SEEDED)).then(
			() => true,
			() => false,
		)
	)
		return;

	await admin(server, `create database ${source} template ${TEMPLATE}`);
	const handle = await connectDatabase(at(server, source));
	const context = createTestContext(handle.db, localStorage(join(seeded, 'storage')), models);
	const ledger = await createLedger(handle.db);
	const directory = join(LEDGERS, name);

	for (const key of await readdir(directory).then((k) => k.toSorted()))
		await provide(context, async () =>
			Files.createFile({ ledger, key, content: await readFile(join(directory, key), 'utf8') }),
		).then((r) => r._unsafeUnwrap());

	await sql`analyze`.execute(handle.db);
	await handle.close();
	await writeFile(join(seeded, SEEDED), JSON.stringify(ledger));
};

/** Holds a lock every worker of the run shares, so a fixture is seeded once and never cloned half-built. */
const locked = async (server: string, f: () => Promise<void>) => {
	const client = new pg.Client(server);
	await client.connect();
	await client.query('select pg_advisory_lock($1)', [LOCK]);
	await f().finally(() => client.end());
};
