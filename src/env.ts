import { defaultConfiguration } from '#lib/server/shared/config.ts';
import { safely } from '#lib/server/shared/control.ts';
import { isDateFormat, isTimeFormat } from '#services/ledger/application/shared.ts';
import { defineEnvVars } from '@sveltejs/kit/env';
import { availableParallelism } from 'node:os';
import * as v from 'valibot';

const text = (fallback: string) =>
	v.pipe(
		v.optional(v.string()),
		v.transform((a) => a || fallback),
	);

const count = (fallback: number) =>
	v.pipe(
		v.optional(v.string()),
		v.transform((a) => (a ? Number(a) : fallback)),
		v.integer(),
		v.minValue(1),
	);

const choice = <const T extends [string, ...string[]]>(o: T) => v.pipe(text(o[0]), v.picklist(o));

const formats = (defaults: string[], check: (format: string) => boolean, pinned: string) =>
	v.pipe(
		text(defaults.join('|')),
		v.transform((a) => a.split('|').map((f) => f.trim())),
		v.rawCheck(({ dataset, addIssue }) => {
			const bad = dataset.typed ? dataset.value.filter((f) => safely(() => check(f)) !== true) : [];
			if (bad.length > 0) addIssue({ message: `${bad.join(', ')} must pin down ${pinned}` });
		}),
	);

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			'Postgres to connect to. Without one, the server starts its own Postgres on `RUPEE_DATA_DIR/postgres`.',
		schema: v.optional(v.string()),
	},
	RUPEE_MIGRATIONS_DIR: {
		description: 'Directory of the database migrations the server applies when it starts.',
		schema: text('drizzle'),
	},
	RUPEE_DATA_DIR: {
		description:
			'Where the server keeps its data. Each user with `local` storage gets `users/<id>/` beneath it, holding their schemas and the ledgers they own.',
		schema: text('data'),
	},
	RUPEE_MODELS_DIR: {
		description:
			'Directory of the table recognition models PDF import needs; the server downloads them there.',
		schema: text('data/models'),
	},
	RUPEE_MODELS: {
		description:
			'`download` (the default) downloads models missing from `RUPEE_MODELS_DIR` or not their pinned revision when the server starts; `verify` only checks them, never connecting out.',
		schema: choice(['download', 'verify']),
	},
	RUPEE_MODEL_THREADS: {
		description:
			'Threads each model run may use, so that one import does not take every core from the others. Defaults to a quarter of the cores.',
		schema: count(Math.max(1, Math.floor(availableParallelism() / 4))),
	},
	RUPEE_DATE_FORMATS: {
		description:
			'`|`-separated date-fns formats (https://date-fns.org/docs/format) a transaction header date may take, like `yyyy-MM-dd|d MMM yyyy`. Replaces the built-in list.',
		schema: formats(defaultConfiguration.dateFormats, isDateFormat, 'a year, month and day'),
	},
	RUPEE_TIME_FORMATS: {
		description:
			'`|`-separated date-fns formats of the optional time after a header date, like `HH:mm|h:mm a`. Replaces the built-in list.',
		schema: formats(defaultConfiguration.timeFormats, isTimeFormat, 'an hour and minute'),
	},
	RUPEE_LOG_LEVEL: {
		description:
			'Least severe level logged: `trace`, `debug`, `info` (the default), `warn`, `error`, `fatal` or `silent`.',
		schema: choice(['info', 'trace', 'debug', 'warn', 'error', 'fatal', 'silent']),
	},
	RUPEE_SIGNUP: {
		description:
			'`open` lets anyone create an account; `closed` (the default) lets only the first user.',
		schema: choice(['closed', 'open']),
	},
});
