import { withContext } from '#lib/server/shared/context/context.ts';
import type { Batch } from '#lib/server/shared/result/batch.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { findCited, importFile, parseFile } from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import { predictAccounts } from '#services/ledger/application/prediction.ts';
import { categorised, copy, draft, uncategorised, type Draft } from '../domain/draft';
import { readRecords } from '../domain/runtime';
import { parseSchema } from '../domain/schema';
import type { RupeeRecord } from '../domain/types';
import { addSchema, isBuiltin, type SchemaText } from './schemas';
import { findByChecksum, findStatement, type Statement } from './statements';

type ExtractOptions = {
	ledger: Ledger;
	statement: string;
	schema: SchemaText;
};

export const extract = ({ ledger, statement, schema }: ExtractOptions): ResultAsync<Draft> =>
	withAccount(schema).asyncAndThen(({ parsed, account }) =>
		findStatement(ledger, statement).andThen((s) =>
			readRecords({ schema: parsed, file: statement, grid: s.grid }).asyncAndThen((r) =>
				drafted({ ledger, statement: s, account, records: r }),
			),
		),
	);

/** A draft checked as the ledger would read it, with the errors of both steps. */
export const preview = (options: ExtractOptions) =>
	extract(options).map((d) => {
		const checked = parseFile(d.key, d.content);
		const failed = [...d.failed, ...checked.failed];
		return { key: d.key, transactions: checked.succeeded, failed };
	});

/** Files a draft for review, keeping the built-in schema that read it. */
export const save = ({ ledger, statement, schema }: ExtractOptions) =>
	extract({ ledger, statement, schema }).andThen((d) =>
		(isBuiltin(schema) ? addSchema(ledger, schema) : okAsync(undefined)).andThen(() =>
			importFile({ ledger, key: d.key, content: d.content }),
		),
	);

/** Files a statement that is a ledger file already, as written, unless a file cites it; so running it again is harmless. */
export const importText = (ledger: Ledger, checksum: string): ResultAsync<void> =>
	findCited(ledger, [checksum]).andThen((cited) =>
		cited.length > 0
			? okAsync(undefined)
			: findByChecksum(ledger, checksum).andThen((s) =>
					s ? copied(ledger, s) : okAsync(undefined),
				),
	);

const copied = (ledger: Ledger, s: Statement): ResultAsync<void> =>
	withContext('config')((c) => {
		const d = copy({ config: c.ledger, statement: s, text: s.text });
		return importFile({ ledger, key: d.key, content: d.content }).map(() => undefined);
	});

const withAccount = ({ key, content }: SchemaText) =>
	parseSchema(key, content).andThen((p) =>
		p.account
			? ok({ parsed: p, account: p.account })
			: err(fault('ExtractionWithoutAccount', { path: key })),
	);

type DraftedOptions = {
	ledger: Ledger;
	statement: Statement;
	account: string;
	records: Batch<RupeeRecord>;
};

const drafted = ({ ledger, statement, account, records }: DraftedOptions): ResultAsync<Draft> =>
	predictAccounts({ ledger, account, lines: uncategorised(records.succeeded) }).map((p) =>
		withContext('config')((c) =>
			draft({
				config: c.ledger,
				statement,
				account,
				records: [...categorised(records.succeeded), ...p],
				failed: records.failed,
			}),
		),
	);
