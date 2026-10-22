import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import * as DB from '../adapters/database';
import { isReadable, READER_VERSION, readContents, unlock, type Upload } from '../adapters/reader';
import * as Stored from '../adapters/storage-statements';
import type { Contents, Grid } from '../domain/types';

const STATEMENT_CONTENTS_LIFETIME = 24 * 60 * 60 * 1000;

export type Statement = {
	key: string;
	checksum: string;
	originalChecksum: string | null;
	grid: Grid;
	text: string[];
};

type StoreStatementOptions = { ledger: Ledger; upload: Upload };

/** Stores an upload in the ledger's statements, in a folder for the day, once per content. */
export const storeStatement = ({
	ledger,
	upload,
}: StoreStatementOptions): ResultAsync<Stored.StoredStatement> =>
	isReadable(upload.name)
		? openStatements(ledger).andThen((s) =>
				Stored.store(s, ledger.id, {
					key: `${uploadDay()}/${upload.name}`,
					content: upload.content,
				}),
			)
		: errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));

type UnlockStatementOptions = { ledger: Ledger; statement: string; password: string };

/** Replaces a locked statement with its content unlocked. The password is not kept. */
export const unlockStatement = ({
	ledger,
	statement,
	password,
}: UnlockStatementOptions): ResultAsync<Statement> =>
	openStatements(ledger).andThen((s) =>
		Stored.read(s, ledger.id, statement)
			.andThen(({ content }) => unlock({ name: statement, content, password }))
			.andThen((c) => Stored.replace(s, ledger.id, { key: statement, content: c }))
			.andThen(readFresh),
	);

type ReadByChecksumOptions = { ledger: Ledger; checksum: string };

/** The statement stored with this content, wherever it was moved, or null once deleted. */
export const readByChecksum = ({
	ledger,
	checksum,
}: ReadByChecksumOptions): ResultAsync<Statement | null> =>
	openStatements(ledger)
		.andThen((s) => Stored.findByChecksum(s, ledger.id, checksum))
		.andThen((s) => (s ? cached(s) : okAsync(null)));

type ReadStatementOptions = { ledger: Ledger; key: string };

/** A statement the ledger already has, read from the cache while it lasts. */
export const readStatement = ({ ledger, key }: ReadStatementOptions): ResultAsync<Statement> =>
	openStatements(ledger).andThen((s) =>
		Stored.findByKey(s, ledger.id, key).andThen(({ checksum, originalChecksum }) =>
			DB.findStatementContents({ checksum, reader: READER_VERSION }).andThen((c) =>
				c
					? okAsync({ key, checksum, originalChecksum, ...c })
					: Stored.read(s, ledger.id, key).andThen(readFresh),
			),
		),
	);

type DropMissingOptions = { ledger: Ledger; keys: string[] };

/** Forgets the statements whose file is gone, and returns the keys still stored. */
export const dropMissing = ({ ledger, keys }: DropMissingOptions): ResultAsync<string[]> =>
	openStatements(ledger).andThen((s) => Stored.dropMissing(s, ledger.id, keys));

const openStatements = (l: Ledger) => openFolder({ ledger: l, folder: 'statements' });

const uploadDay = () => Temporal.Now.plainDateISO().toString().replaceAll('-', '');

const readFresh = (s: Stored.StoredStatement): ResultAsync<Statement> =>
	readContents({ name: s.key, content: s.content }).andThen((r) => remember(statementOf(s, r)));

const cached = (s: Stored.StoredStatement): ResultAsync<Statement> =>
	DB.findStatementContents({ checksum: s.checksum, reader: READER_VERSION }).andThen((c) =>
		c ? okAsync(statementOf(s, c)) : readFresh(s),
	);

const statementOf = (s: Stored.StoredStatement, c: Contents): Statement => ({
	key: s.key,
	checksum: s.checksum,
	originalChecksum: s.originalChecksum,
	...c,
});

const remember = (s: Statement): ResultAsync<Statement> =>
	DB.saveStatementContents({
		checksum: s.checksum,
		reader: READER_VERSION,
		contents: { grid: s.grid, text: s.text },
		expiresAt: new Date(Date.now() + STATEMENT_CONTENTS_LIFETIME),
	}).map(() => s);
