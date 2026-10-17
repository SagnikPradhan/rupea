import { jobs, JobStatus } from '#lib/server/db/schema.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { provide, withContext, type RupeeContext } from '#lib/server/shared/context/context.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { attempt, errAsync, okAsync } from '#lib/server/shared/result/result.ts';
import { createTemporaryDatabase } from '#tests/shared/database.ts';
import { createUser } from '#tests/shared/seed.ts';
import { it as base } from '#tests/shared/vitest.ts';
import { processes, type Processes } from '#services/jobs/adapters/processes.ts';
import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { describe, expect } from 'vitest';
import * as v from 'valibot';
import * as Jobs from '#services/jobs/application/jobs.ts';
import * as Orchestrator from '#services/jobs/application/orchestrator.ts';
import { runJob } from '#services/jobs/application/worker.ts';

type Echo = { word: string };

const echo = v.object({ word: v.string() });

const it = base.extend<{ user: string }>({
	user: async ({ db }, use) => use((await createUser(db)).userId),
});

const recorder = (fail?: RupeeError) => {
	const runs: { word: string; user: string }[] = [];
	const job: Jobs.Job<Echo> = {
		name: 'echo',
		version: 1,
		payload: echo,
		run: (p, user) => {
			runs.push({ word: p.word, user });
			return fail ? errAsync(fail) : okAsync(undefined);
		},
	};
	return { job, runs };
};

const abandoned = {
	status: JobStatus.Running,
	attempts: 1,
	leasedUntil: sql`now() - interval '1 second'`,
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rowsOf = (u: string) =>
	withContext('db')((db) => db.select().from(jobs).where(eq(jobs.userId, u)));

const inProcess =
	(l: Jobs.Job<unknown>[]): Orchestrator.Dispatch =>
	(c) =>
		runJob(l, c);

/** Ticks until no job is due, and counts the jobs it settled. */
const drain = async (l: Jobs.Job<unknown>[], dispatch = inProcess(l)): Promise<number> => {
	await Orchestrator.releaseExpired(l);
	return tickAll({ jobs: l, dispatch });
};

const tickAll = async (o: {
	jobs: Jobs.Job<unknown>[];
	dispatch: Orchestrator.Dispatch;
}): Promise<number> => ((await Orchestrator.tick(o)).unwrapOr(false) ? 1 + (await tickAll(o)) : 0);

describe('a job', () => {
	it('runs once, as the user who queued it, and shows them it succeeded', ({ context, user }) =>
		provide(context, async () => {
			const { job, runs } = recorder();

			await Jobs.enqueue({ job, user, payload: { word: 'hi' } });
			const ran = await drain([job]);

			expect(ran).toBe(1);
			expect(runs).toEqual([{ word: 'hi', user }]);
			const listed = await rowsOf(user);
			expect(listed.map((j) => [j.name, j.status])).toEqual([['echo', JobStatus.Succeeded]]);
		}));

	it('is queued once while the same work waits', ({ context, user }) =>
		provide(context, async () => {
			const { job, runs } = recorder();

			await Jobs.enqueue({ job, user, payload: { word: 'twice' } });
			await Jobs.enqueue({ job, user, payload: { word: 'twice' } });
			await drain([job]);

			expect(runs).toHaveLength(1);
		}));

	it('is not queued when the transaction it was queued in rolls back', ({ context, db, user }) =>
		provide(context, async () => {
			const { job } = recorder();

			await atomically(() =>
				Jobs.enqueue({ job, user, payload: { word: 'lost' } }).andThen(() =>
					errAsync(fault('LedgerNotFound', { handle: 'nowhere' })),
				),
			);

			expect(await db.$count(jobs, eq(jobs.userId, user))).toBe(0);
		}));

	it('is tried again later after an error worth retrying', ({ context, user }) =>
		provide(context, async () => {
			const error = fault('UnknownError', { message: 'flaky' });
			const { job, runs } = recorder(error);

			await Jobs.enqueue({ job, user, payload: { word: 'again' } });
			await drain([job]);

			const [row] = await rowsOf(user);
			expect(runs).toHaveLength(1);
			expect(row).toMatchObject({ status: JobStatus.Queued, attempts: 1, error });
			expect(row!.runAt.getTime()).toBeGreaterThan(Date.now());
		}));

	it('fails at once on an error not worth retrying, and keeps it', ({ context, user }) =>
		provide(context, async () => {
			const error = fault('ExtractionLocked', { path: 'a.pdf' });
			const { job } = recorder(error);

			await Jobs.enqueue({ job, user, payload: { word: 'locked' } });
			await drain([job]);

			const listed = await rowsOf(user);
			expect(listed[0]).toMatchObject({ status: JobStatus.Failed, error });
		}));

	it('fails without running when its payload is of another version', ({ context, user }) =>
		provide(context, async () => {
			const { job, runs } = recorder();

			await Jobs.enqueue({ job, user, payload: { word: 'old' } });
			await drain([{ ...job, version: 2 }]);

			const listed = await rowsOf(user);
			expect(runs).toEqual([]);
			expect(listed[0]?.error).toEqual(fault('JobOutdated', { name: 'echo', version: 1 }));
		}));

	it('waits for a worker that knows its name and version', ({ context, user }) =>
		provide(context, async () => {
			const { job, runs } = recorder();

			await Jobs.enqueue({ job: { ...job, version: 2 }, user, payload: { word: 'newer' } });
			await drain([job]);

			const listed = await rowsOf(user);
			expect(runs).toEqual([]);
			expect(listed[0]?.status).toBe(JobStatus.Queued);
		}));

	it('runs the next job of its partition a worker knows, past a newer one', ({ context, user }) =>
		provide(context, async () => {
			const { job, runs } = recorder();

			await Jobs.enqueue({ job: { ...job, version: 2 }, user, payload: { word: 'newer' } });
			await Jobs.enqueue({ job, user, payload: { word: 'known' } });
			await drain([job]);

			expect(runs).toEqual([{ word: 'known', user }]);
		}));

	it("is queued for each user, even when another's waits with the same payload", ({
		context,
		db,
	}) =>
		provide(context, async () => {
			const [a, b] = [(await createUser(db)).userId, (await createUser(db)).userId];
			const { job, runs } = recorder();

			await Jobs.enqueue({ job, user: a, payload: { word: 'same' } });
			await Jobs.enqueue({ job, user: b, payload: { word: 'same' } });
			await drain([job]);

			expect(runs.map((r) => r.user).sort()).toEqual([a, b].sort());
		}));

	it('is tried again later when its worker stopped before finishing it', ({ context, db, user }) =>
		provide(context, async () => {
			const { job, runs } = recorder();

			await Jobs.enqueue({ job, user, payload: { word: 'abandoned' } });
			await db.update(jobs).set(abandoned).where(eq(jobs.userId, user));
			await drain([job]);

			const [row] = await rowsOf(user);
			expect(runs).toEqual([]);
			expect(row).toMatchObject({ status: JobStatus.Queued, attempts: 1 });
			expect(row!.runAt.getTime()).toBeGreaterThan(Date.now());
		}));

	it('fails when its worker stopped, if it retries no error', ({ context, db, user }) =>
		provide(context, async () => {
			const job = { ...recorder().job, retries: [] };

			await Jobs.enqueue({ job, user, payload: { word: 'abandoned' } });
			await db.update(jobs).set(abandoned).where(eq(jobs.userId, user));
			await drain([job]);

			const [row] = await rowsOf(user);
			expect(row).toMatchObject({ status: JobStatus.Failed, error: { type: 'UnknownError' } });
		}));

	it('makes way for a copy queued while it ran, rather than running again', ({
		context,
		db,
		user,
	}) =>
		provide(context, async () => {
			const { job, runs } = recorder();

			await Jobs.enqueue({ job, user, payload: { word: 'edited' } });
			await db.update(jobs).set(abandoned).where(eq(jobs.userId, user));
			await Jobs.enqueue({ job, user, payload: { word: 'edited' } });
			await drain([job]);

			const rows = await rowsOf(user);
			expect(runs).toHaveLength(1);
			expect(rows).toMatchObject([{ status: JobStatus.Succeeded, attempts: 1 }]);
		}));
});

describe('workers', () => {
	const slow = (
		name: string,
		partition: (w: string) => string,
		at = { now: 0, most: 0, meet: 1 },
	) => {
		const job: Jobs.Job<Echo> = {
			name,
			version: 1,
			payload: echo,
			partition: (p) => partition(p.word),
			run: () => {
				at.now += 1;
				at.most = Math.max(at.most, at.now);
				return attempt(() => overlap(at)).map(() => {
					at.now -= 1;
				});
			},
		};
		return { job, at };
	};

	/** Holds a job until `meet` of them run at once, or two seconds pass, so overlap never hangs on timing. */
	const overlap = async (at: { now: number; meet: number }) => {
		const until = Date.now() + 2000;
		while (at.now < at.meet && Date.now() < until) await pause(10);
		await pause(50);
	};

	const started = async (context: RupeeContext, j: Jobs.Job<Echo>[], ready = Promise.resolve()) => {
		const handle = await createTemporaryDatabase();
		const ctx = { ...context, db: handle.orm };
		const workers = Orchestrator.orchestrate({
			context: ctx,
			jobs: j,
			dispatch: inProcess(j),
			count: 2,
			ready,
		});
		return { ctx, handle, workers };
	};

	const succeeded = (ctx: RupeeContext, count: number) =>
		expect
			.poll(() => ctx.db.$count(jobs, eq(jobs.status, JobStatus.Succeeded)), { timeout: 3000 })
			.toBe(count);

	it('run jobs of one partition one at a time', async ({ context }) => {
		const { job, at } = slow('slow', () => 'same');
		const { ctx, handle, workers } = await started(context, [job]);

		await provide(ctx, async () => {
			const user = (await createUser(ctx.db)).userId;
			for (const word of ['a', 'b', 'c']) await Jobs.enqueue({ job, user, payload: { word } });
			await succeeded(ctx, 3);
		});

		await workers.stop();
		await handle.close();
		expect(at.most).toBe(1);
	});

	it('run jobs of different partitions side by side', async ({ context }) => {
		const { job, at } = slow('slow', (w) => w, { now: 0, most: 0, meet: 2 });
		const { ctx, handle, workers } = await started(context, [job]);

		await provide(ctx, async () => {
			const user = (await createUser(ctx.db)).userId;
			for (const word of ['a', 'b']) await Jobs.enqueue({ job, user, payload: { word } });
			await succeeded(ctx, 2);
		});

		await workers.stop();
		await handle.close();
		expect(at.most).toBe(2);
	});

	it('run jobs of different names side by side, even with the same partition', async ({
		context,
	}) => {
		const first = slow('first', () => 'same', { now: 0, most: 0, meet: 2 });
		const second = slow('second', () => 'same', first.at);
		const { ctx, handle, workers } = await started(context, [first.job, second.job]);

		await provide(ctx, async () => {
			const user = (await createUser(ctx.db)).userId;
			await Jobs.enqueue({ job: first.job, user, payload: { word: 'a' } });
			await Jobs.enqueue({ job: second.job, user, payload: { word: 'a' } });
			await succeeded(ctx, 2);
		});

		await workers.stop();
		await handle.close();
		expect(first.at.most).toBe(2);
	});

	it('wait to claim until they are ready', async ({ context }) => {
		const { job } = slow('slow', (w) => w);
		const ready = Promise.withResolvers<void>();
		const { ctx, handle, workers } = await started(context, [job], ready.promise);

		await provide(ctx, async () => {
			const user = (await createUser(ctx.db)).userId;
			await Jobs.enqueue({ job, user, payload: { word: 'a' } });
			await pause(1500);
			expect(await ctx.db.$count(jobs, eq(jobs.status, JobStatus.Succeeded))).toBe(0);

			ready.resolve();
			await succeeded(ctx, 1);
		});

		await workers.stop();
		await handle.close();
	});
});

describe('a job in a worker process', () => {
	const job: Jobs.Job<Echo> = {
		name: 'echo',
		version: 1,
		payload: echo,
		run: () => okAsync(undefined),
	};

	const forked = it.extend<{ pool: Processes }>({
		pool: async ({}, use) => {
			const pool = processes({
				entry: fileURLToPath(new URL('fixtures/worker.ts', import.meta.url)),
				count: 1,
				env: {},
				execArgv: ['--import', 'tsx'],
			});
			await use(pool);
			await pool.stop();
		},
	});

	forked('succeeds when the process returns no error', ({ context, pool, user }) =>
		provide(context, async () => {
			await Jobs.enqueue({ job, user, payload: { word: 'fine' } });
			await drain([job], pool.dispatch);

			const listed = await rowsOf(user);
			expect(listed[0]?.status).toBe(JobStatus.Succeeded);
		}),
	);

	forked('keeps the error the process returned', ({ context, pool, user }) =>
		provide(context, async () => {
			await Jobs.enqueue({ job, user, payload: { word: 'locked' } });
			await drain([job], pool.dispatch);

			const listed = await rowsOf(user);
			expect(listed[0]).toMatchObject({
				status: JobStatus.Failed,
				error: fault('ExtractionLocked', { path: 'a.pdf' }),
			});
		}),
	);

	forked(
		'fails, killing its process, once it runs longer than its timeout',
		({ context, pool, user }) =>
			provide(context, async () => {
				const hanging = { ...job, timeout: 500 };

				await Jobs.enqueue({ job: hanging, user, payload: { word: 'hang' } });
				await drain([hanging], pool.dispatch);

				const listed = await rowsOf(user);
				expect(listed[0]).toMatchObject({
					status: JobStatus.Failed,
					error: fault('JobTimedOut', { name: 'echo', timeout: 500 }),
				});
			}),
	);

	forked('is tried again later when its process exits', ({ context, pool, user }) =>
		provide(context, async () => {
			await Jobs.enqueue({ job, user, payload: { word: 'crash' } });
			await drain([job], pool.dispatch);

			const [row] = await rowsOf(user);
			expect(row).toMatchObject({ status: JobStatus.Queued, attempts: 1 });
			expect(row!.error?.type).toBe('UnknownError');
		}),
	);
});
