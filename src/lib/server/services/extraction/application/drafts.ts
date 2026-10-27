import { withContext } from '#lib/server/shared/context/context.ts';
import type { Batch } from '#lib/server/shared/result/batch.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, errAsync, ok, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { isLedgerFile } from '#lib/shared/statements.ts';
import { findImported, importFile, parseFile } from '#services/ledger/application/files.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';
import type { RupeaTransaction } from '#services/ledger/application/shared.ts';
import { predictAccounts } from '#services/ledger/application/prediction.ts';
import { categorised, copy, draft, uncategorised, type Draft } from '../domain/draft';
import { readRecords } from '../domain/runtime';
import { parseSchema } from '../domain/schema';
import type { RupeaRecord } from '../domain/types';
import { addSchema, isBuiltin, recogniseStatement, type SchemaText } from './schemas';
import { readByChecksum, readStatement, type Statement } from './statements';

/** Why a statement waits for its user to unlock it or describe it, which no job can. */
const WAITING = new Set(['ExtractionLocked', 'ExtractionUnrecognised']);

type ExtractOptions = {
	ledger: Ledger;
	statement: string;
	schema: SchemaText;
};

export const extract = ({ ledger, statement, schema }: ExtractOptions): ResultAsync<Draft> =>
	withAccount(schema).asyncAndThen(({ parsed, account }) =>
		readStatement({ ledger, key: statement }).andThen((s) =>
			readRecords({ schema: parsed, file: statement, grid: s.grid }).asyncAndThen((r) =>
				drafted({ ledger, statement: s, account, records: r }),
			),
		),
	);

/** A draft checked as the ledger would read it, with the errors of both steps. */
export const previewStatement = (options: ExtractOptions): ResultAsync<Batch<RupeaTransaction>> =>
	extract(options).map((d) => {
		const checked = parseFile({ key: d.key, content: d.content });
		return { succeeded: checked.succeeded, failed: [...d.failed, ...checked.failed] };
	});

/** Files a draft for review, keeping the built-in schema that read it. */
export const importStatement = ({ ledger, statement, schema }: ExtractOptions) =>
	extract({ ledger, statement, schema }).andThen((d) =>
		(isBuiltin(schema) ? addSchema({ ledger, schema }) : okAsync(undefined)).andThen(() =>
			importFile({ ledger, key: d.key, content: d.content }),
		),
	);

type DraftUploadOptions = { ledger: Ledger; checksum: string };

/** Files an upload for review, unless a file has it already: a ledger file as written, a statement read with the schema that recognises it. */
export const draftUpload = ({ ledger, checksum }: DraftUploadOptions): ResultAsync<void> =>
	findImported({ ledger, checksums: [checksum] })
		.andThen((i) => (i.length > 0 ? okAsync(null) : readByChecksum({ ledger, checksum })))
		.andThen((s) => (s ? fileDraft(ledger, s) : okAsync(undefined)))
		.orElse((e) => (WAITING.has(e.type) ? okAsync(undefined) : errAsync(e)));

const fileDraft = (ledger: Ledger, s: Statement): ResultAsync<void> => {
	if (!isLedgerFile(s.key))
		return recogniseStatement({ ledger, statement: s.key })
			.andThen((r) => importStatement({ ledger, statement: s.key, schema: r }))
			.map(() => undefined);

	const d = withContext('config')((c) => copy({ config: c.ledger, statement: s, text: s.text }));
	return importFile({ ledger, key: d.key, content: d.content }).map(() => undefined);
};

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
	records: Batch<RupeaRecord>;
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
