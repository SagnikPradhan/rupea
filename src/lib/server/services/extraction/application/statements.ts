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

/** Stores an upload in the ledger's statements, in a folder for the day, once per content. */
export const storeStatement = (ledger: Ledger, upload: Upload): ResultAsync<StoredStatement> =>
	isReadable(upload.name)
		? ledgerStatements(ledger).andThen((s) =>
				s.store(`${uploadDay()}/${upload.name}`, upload.content),
			)
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
			.andThen(readFresh),
	);
};

/** The statement stored with this content, wherever it was moved, or null once deleted. */
export const findByChecksum = (l: Ledger, c: string): ResultAsync<Statement | null> =>
	ledgerStatements(l)
		.andThen((s) => s.locate(c))
		.andThen((s) => (s ? cached(s) : okAsync(null)));

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

/** Of these statements, those still stored; the rest are forgotten. */
export const keepStored = (l: Ledger, k: string[]): ResultAsync<string[]> =>
	ledgerStatements(l).andThen((s) => s.present(k));

const ledgerStatements = (l: Ledger): ResultAsync<Statements> =>
	openFolder(l, 'statements').map((s) => statements(s, l.id));

const uploadDay = () => Temporal.Now.plainDateISO().toString().replaceAll('-', '');

const readFresh = (s: StoredStatement): ResultAsync<Statement> =>
	readContents({ name: s.key, content: s.content }).andThen((r) => remember(statementOf(s, r)));

const cached = (s: StoredStatement): ResultAsync<Statement> =>
	findStatementContents({ checksum: s.checksum, reader: READER_VERSION }).andThen((c) =>
		c ? okAsync(statementOf(s, c)) : readFresh(s),
	);

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
