import { sql } from 'drizzle-orm';
import * as PG from 'drizzle-orm/pg-core';
import { base } from '#lib/server/db/columns.ts';
import type { RupeaError } from '#lib/server/shared/result/error.ts';
import { users } from '#services/auth/adapters/database-schema.ts';
import { JobStatus } from '../domain/jobs';

export const jobStatus = PG.pgEnum('job_status', JobStatus);

/** Jobs of one name and partition run one at a time, which `jobs_name_partition_running` enforces. */
export const jobs = PG.pgTable(
	'jobs',
	(t) => ({
		...base,
		userId: t
			.uuid()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: t.text().notNull(),
		partition: t.text().notNull(),
		version: t.integer().notNull(),
		payload: t.jsonb().notNull(),
		dedupe: t.text().notNull(),
		status: jobStatus().notNull().default(JobStatus.Queued),
		attempts: t.integer().notNull().default(0),
		runAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
		leasedUntil: t.timestamp({ withTimezone: true }),
		error: t.jsonb().$type<RupeaError>(),
	}),
	(t) => [
		PG.uniqueIndex('jobs_user_id_name_dedupe_queued')
			.on(t.userId, t.name, t.dedupe)
			.where(sql`${t.status} = 'queued'`),
		PG.uniqueIndex('jobs_name_partition_running')
			.on(t.name, t.partition)
			.where(sql`${t.status} = 'running'`),
		PG.index('jobs_run_at_queued')
			.on(t.runAt)
			.where(sql`${t.status} = 'queued'`),
		PG.index('jobs_leased_until_running')
			.on(t.leasedUntil)
			.where(sql`${t.status} = 'running'`),
		PG.index('jobs_status_updated_at').on(t.status, t.updatedAt),
		PG.index('jobs_user_id_created_at').on(t.userId, t.createdAt),
	],
);
