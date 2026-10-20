import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import { findStatementContents, saveStatementContents } from '../adapters/database';
import { isReadable, READER_VERSION, readContents, unlock, type Upload } from '../adapters/reader';
import { statements, type Statements, type StoredStatement } from '../adapters/storage-statements';
import type { Contents, Grid } from '../domain/types';

const STATEMENT_CONTENTS_LIFETIME = 24 * 60 * 60 * 1000;

export type Statement = {
	key: string;
	checksum: string;
	originalChecksum: string | null;
	grid: Grid;
	text: string[];
};

/** Stores an upload in the ledger's statements, once per content, and reads it. A locked one is kept to unlock. */
export const uploadStatement = (ledger: Ledger, upload: Upload): ResultAsync<Statement> =>
	isReadable(upload.name)
		? ledgerStatements(ledger)
				.andThen((s) => s.store(upload.name, upload.content))
				.andThen(contentsOf)
		: errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));

type UnlockOptions = {
	ledger: Ledger;
	statement: string;
	password: string;
};

/** Replaces a locked statement with its content unlocked. The password is not kept. */
export const unlockStatement = (options: UnlockOptions): ResultAsync<Statement> => {
	const { ledger, statement, password } = options;
	return ledgerStatements(ledger).andThen((s) =>
		s
			.read(statement)
			.andThen(({ content }) => unlock({ name: statement, content, password }))
			.andThen((c) => s.replace(statement, c))
			.andThen(contentsOf),
	);
};

/** A statement the ledger already has, read from the cache while it lasts. */
export const findStatement = (l: Ledger, k: string): ResultAsync<Statement> =>
	ledgerStatements(l).andThen((s) =>
		s
			.find(k)
			.andThen(({ checksum, originalChecksum }) =>
				findStatementContents({ checksum, reader: READER_VERSION }).andThen((c) =>
					c ? okAsync({ key: k, checksum, originalChecksum, ...c }) : s.read(k).andThen(readFresh),
				),
			),
	);

const ledgerStatements = (l: Ledger): ResultAsync<Statements> =>
	openFolder(l, 'statements').map((s) => statements(s, l.id));

// Contents are cached by checksum, so the same statement in another ledger is not read twice.
const contentsOf = (s: StoredStatement): ResultAsync<Statement> =>
	findStatementContents({ checksum: s.checksum, reader: READER_VERSION }).andThen((c) =>
		c ? okAsync(statementOf(s, c)) : readFresh(s),
	);

const readFresh = (s: StoredStatement): ResultAsync<Statement> =>
	readContents({ name: s.key, content: s.content }).andThen((r) => remember(statementOf(s, r)));

const statementOf = (s: StoredStatement, c: Contents): Statement => ({
	key: s.key,
	checksum: s.checksum,
	originalChecksum: s.originalChecksum,
	...c,
});

const remember = (s: Statement): ResultAsync<Statement> =>
	saveStatementContents({
		checksum: s.checksum,
		reader: READER_VERSION,
		contents: { grid: s.grid, text: s.text },
		expiresAt: new Date(Date.now() + STATEMENT_CONTENTS_LIFETIME),
	}).map(() => s);
