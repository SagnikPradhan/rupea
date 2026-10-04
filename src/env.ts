import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';
import { isDateFormat, isTimeFormat } from '#lib/server/services/ledger/domain/parser.ts';
import { defaultConfiguration } from '#lib/server/shared/config.ts';
import { safely } from '#lib/server/shared/result.ts';

/** The value, or `fallback` if it is unset or empty. */
const text = (fallback: string) =>
	v.pipe(
		v.optional(v.string()),
		v.transform((a) => a || fallback),
	);

/** One of `options`, the first being the default. */
const choice = <const T extends [string, ...string[]]>(o: T) => v.pipe(text(o[0]), v.picklist(o));

/** A `|`-separated list of formats, each checked; date-fns throws on unknown tokens. */
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
	DATABASE_PATH: {
		description: 'Path to the SQLite database file.',
		schema: text('data/rupee.db'),
	},
	RUPEE_STORAGE: {
		description: 'Where ledger files are stored. Only `local` for now.',
		schema: choice(['local']),
	},
	RUPEE_DATA_DIR: {
		description: 'Root directory of `local` storage. Each ledger gets `ledgers/<id>/` beneath it.',
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
