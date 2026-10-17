import { availableParallelism } from 'node:os';
import * as v from 'valibot';
import { safely } from '../control';
import { DATE_FORMATS, isDateFormat, isTimeFormat, TIME_FORMATS } from '../dates';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
const QUARTER_OF_CORES = Math.max(1, Math.floor(availableParallelism() / 4));

export type RupeeConfiguration = v.InferOutput<typeof configuration>;
export type LedgerConfiguration = RupeeConfiguration['ledger'];

export const defaultConfiguration: RupeeConfiguration = {
	storage: { database: null, files: 'data' },
	models: { dir: 'data/models', mode: 'download', threads: QUARTER_OF_CORES },
	ledger: { dateFormats: DATE_FORMATS, timeFormats: TIME_FORMATS },
	accounts: { signup: 'closed' },
	log: { level: 'info' },
};

/** The defaults, overridden by each variable the environment sets. */
export const readConfiguration = (e: NodeJS.ProcessEnv): RupeeConfiguration =>
	validate(combine(defaultConfiguration, fromEnv(e)));

const fromEnv = (env: NodeJS.ProcessEnv) => {
	const read = (k: string) => env[k] || undefined;
	const number = (k: string) => (read(k) ? Number(read(k)) : undefined);
	const list = (k: string) =>
		read(k)
			?.split('|')
			.map((f) => f.trim());

	return {
		storage: { database: read('DATABASE_URL'), files: read('RUPEE_STORAGE_FILES') },
		models: {
			dir: read('RUPEE_MODELS_DIR'),
			mode: read('RUPEE_MODELS_MODE'),
			threads: number('RUPEE_MODELS_THREADS'),
		},
		ledger: {
			dateFormats: list('RUPEE_LEDGER_DATE_FORMATS'),
			timeFormats: list('RUPEE_LEDGER_TIME_FORMATS'),
		},
		accounts: { signup: read('RUPEE_ACCOUNTS_SIGNUP') },
		log: { level: read('RUPEE_LOG_LEVEL') },
	};
};

type Layer = Record<string, Record<string, unknown>>;
const combine = (d: Layer, e: Layer) =>
	Object.fromEntries(
		Object.entries(d).map(([k, area]) => {
			const set = Object.entries(e[k] ?? {}).filter(([, x]) => x !== undefined);
			return [k, { ...area, ...Object.fromEntries(set) }];
		}),
	);

const validate = (raw: unknown): RupeeConfiguration => {
	const parsed = v.safeParse(configuration, raw);
	// eslint-disable-next-line functional/no-throw-statements -- the server cannot start without it
	if (!parsed.success) throw new Error(`Invalid configuration\n${v.summarize(parsed.issues)}`);

	return parsed.output;
};

const text = v.pipe(v.string(), v.nonEmpty());
const count = (n: number) => v.pipe(v.number(), v.integer(), v.minValue(n));
const formats = (check: (format: string) => boolean, pinned: string) =>
	v.array(
		v.pipe(
			v.string(),
			v.check((f) => safely(() => check(f)) === true, `must pin down ${pinned}`),
		),
	);

const configuration = v.object({
	storage: v.object({ database: v.nullable(v.string()), files: text }),
	models: v.object({ dir: text, mode: v.picklist(['download', 'verify']), threads: count(1) }),
	ledger: v.object({
		dateFormats: formats(isDateFormat, 'a year, month and day'),
		timeFormats: formats(isTimeFormat, 'an hour and minute'),
	}),
	accounts: v.object({ signup: v.picklist(['open', 'closed']) }),
	log: v.object({ level: v.picklist(LOG_LEVELS) }),
});
