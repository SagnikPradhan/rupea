import { atomically } from '#lib/server/db/atomically.ts';
import { attemptWrite } from '#lib/server/db/errors.ts';
import { jobs, JobStatus } from '#lib/server/db/schema.ts';
import { provide, withContext } from '#lib/server/shared/context/context.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { ResultAsync } from '#lib/server/shared/result/result.ts';
import { createUser } from '#tests/shared/seed.ts';
import { it } from '#tests/shared/vitest.ts';
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import * as Jobs from '#services/jobs/adapters/database.ts';

const queued = (user: string, name: string) => ({
	userId: user,
	name,
	version: 1,
	payload: {},
	partition: user,
	dedupe: name,
});

describe('the jobs store', () => {
	it('fails jobs queued for long under a name no server knows', ({ context, db }) =>
		provide(context, async () => {
			const user = (await createUser(db)).userId;
			await Jobs.insertJob(queued(user, 'gone'));
			await Jobs.insertJob(queued(user, 'known'));
			await db
				.update(jobs)
				.set({ runAt: sql`now() - interval '2 days'` })
				.where(eq(jobs.userId, user));

			await Jobs.sweep(['known']);

			const rows = await db.select().from(jobs).where(eq(jobs.userId, user)).orderBy(jobs.name);
			expect(rows).toMatchObject([
				{ name: 'gone', status: JobStatus.Failed, error: fault('JobUnknown', { name: 'gone' }) },
				{ name: 'known', status: JobStatus.Queued },
			]);
		}));

	it('claims past a partition whose job runs', ({ context, db }) =>
		provide(context, async () => {
			const user = (await createUser(db)).userId;
			const known = [{ name: 'busy', version: 1 }];
			await Jobs.insertJob({ ...queued(user, 'busy'), dedupe: 'first' });
			await Jobs.insertJob({ ...queued(user, 'busy'), dedupe: 'second' });
			await Jobs.insertJob({ ...queued(user, 'busy'), dedupe: 'other', partition: 'other' });

			const first = await Jobs.claimJob(known, 60_000);
			const next = await Jobs.claimJob(known, 60_000);
			const none = await Jobs.claimJob(known, 60_000);

			expect(first._unsafeUnwrap()).toMatchObject({ name: 'busy' });
			expect(await partitionOf(next._unsafeUnwrap()!.id)).toBe('other');
			expect(none._unsafeUnwrap()).toBeNull();
		}));

	it('refuses to run two jobs of a partition at once', ({ context, db }) =>
		provide(context, async () => {
			const user = (await createUser(db)).userId;
			await Jobs.insertJob({ ...queued(user, 'single'), dedupe: 'first' });
			await Jobs.insertJob({ ...queued(user, 'single'), dedupe: 'second' });

			const running = attemptWrite(() =>
				db.update(jobs).set({ status: JobStatus.Running }).where(eq(jobs.name, 'single')),
			);

			expect((await running)._unsafeUnwrapErr()).toEqual(
				fault('UniqueViolation', { constraint: 'jobs_name_partition_running' }),
			);
		}));

	it('claims past a partition another claim took first, once that commits', ({ context, db }) =>
		provide(context, async () => {
			const user = (await createUser(db)).userId;
			const known = [{ name: 'raced', version: 1 }];
			await Jobs.insertJob({ ...queued(user, 'raced'), dedupe: 'first' });
			await Jobs.insertJob({ ...queued(user, 'raced'), dedupe: 'second' });
			await Jobs.insertJob({ ...queued(user, 'raced'), dedupe: 'other', partition: 'other' });
			const [claimed, commit] = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];

			const first = atomically(() =>
				Jobs.claimJob(known, 60_000)
					.andTee(() => claimed.resolve())
					.andThen((c) => ResultAsync.fromSafePromise(commit.promise).map(() => c)),
			);
			await claimed.promise;
			const second = Jobs.claimJob(known, 60_000);
			await expect.poll(() => db.$count(sql`pg_locks`, sql`not granted`)).toBe(1);
			commit.resolve();

			expect(await partitionOf((await first)._unsafeUnwrap()!.id)).toBe(user);
			expect(await partitionOf((await second)._unsafeUnwrap()!.id)).toBe('other');
		}));
});

const partitionOf = (id: string) =>
	withContext('db')((db) =>
		db
			.select({ partition: jobs.partition })
			.from(jobs)
			.where(eq(jobs.id, id))
			.then(([j]) => j?.partition),
	);
