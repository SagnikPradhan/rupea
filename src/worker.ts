import { jobs } from '#lib/server/jobs.ts';
import { provide } from '#lib/server/shared/context/context.ts';
import { readConfiguration } from '#lib/server/shared/context/config.ts';
import { createContext, createDatabase } from '#lib/server/shared/context/environment.ts';
import type { RupeeError } from '#lib/server/shared/result/error.ts';
import { runJob, type ClaimedJob } from '#services/jobs/application/jobs.ts';

const dev = process.env['NODE_ENV'] === 'development';

const config = readConfiguration(process.env);
// eslint-disable-next-line functional/no-throw-statements -- a worker must not start its own Postgres
if (!config.storage.database) throw new Error('A worker needs DATABASE_URL');

const database = await createDatabase(config);
const context = createContext(config, database, dev);

export default (c: ClaimedJob): Promise<RupeeError | null> =>
	provide(context, () =>
		runJob(jobs, c).match(
			() => null,
			(e) => e,
		),
	);
