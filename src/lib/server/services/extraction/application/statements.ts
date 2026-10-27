import { sha256 } from '#lib/server/shared/hash.ts';
import { batchInOrder, type Batch } from '#lib/server/shared/result/batch.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, inOrder, okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { writeNumbered, type Storage } from '#lib/server/shared/storage/storage.ts';
import { openFolder, type Ledger } from '#services/ledger/application/ledger.ts';
import * as DB from '../adapters/database';
import { isReadable, READER_VERSION, readContents, unlock } from '../adapters/reader';
import type { Contents, Grid, Upload } from '../domain/types';

const STATEMENT_CONTENTS_LIFETIME = 24 * 60 * 60 * 1000;

export type Statement = {
	key: string;
	checksum: string;
	originalChecksum: string | null;
	grid: Grid;
	text: string[];
};

/** A statement's file as stored, before it is read. */
type Stored = {
	key: string;
	checksum: string;
	originalChecksum: string | null;
	content: Uint8Array;
};

type StoreStatementOptions = { ledger: Ledger; upload: Upload };

/** Stores an upload in a folder for the day; content the ledger has already comes back where it is, and a taken name is numbered. */
export const storeStatement = ({ ledger, upload }: StoreStatementOptions): ResultAsync<Stored> => {
	if (!isReadable(upload.name))
		return errAsync(fault('ExtractionUnsupportedFile', { path: upload.name }));

	const content = upload.content;
	const sum = checksum(content);
	const fresh = {
		key: `${uploadDay()}/${upload.name}`,
		checksum: sum,
		originalChecksum: null,
		content,
	};
	return openStatements(ledger).andThen((s) =>
		findByChecksum(s, ledger.id, sum).andThen((f) =>
			f ? okAsync(f) : writeNew(s, ledger.id, fresh),
		),
	);
};

type UnlockStatementOptions = { ledger: Ledger; statement: string; password: string };

/** Replaces a locked statement with its content unlocked. The password is not kept. */
export const unlockStatement = ({
	ledger,
	statement,
	password,
}: UnlockStatementOptions): ResultAsync<Statement> =>
	openStatements(ledger).andThen((s) =>
		readStored(s, ledger.id, statement)
			.andThen(({ content }) => unlock({ name: statement, content, password }))
			.andThen((c) => replace(s, ledger.id, { key: statement, content: c }))
			.andThen(readFresh),
	);

type ReadByChecksumOptions = { ledger: Ledger; checksum: string };

/** The statement stored with this content, wherever it was moved, or null once deleted. */
export const readByChecksum = ({
	ledger,
	checksum,
}: ReadByChecksumOptions): ResultAsync<Statement | null> =>
	openStatements(ledger)
		.andThen((s) => findByChecksum(s, ledger.id, checksum))
		.andThen((s) => (s ? cached(s) : okAsync(null)));

type ReadStatementOptions = { ledger: Ledger; key: string };

/** A statement the ledger already has, read from the cache while it lasts. */
export const readStatement = ({ ledger, key }: ReadStatementOptions): ResultAsync<Statement> =>
	openStatements(ledger).andThen((s) =>
		findByKey(s, ledger.id, key).andThen(({ checksum, originalChecksum }) =>
			DB.findStatementContents({ checksum, reader: READER_VERSION }).andThen((c) =>
				c
					? okAsync({ key, checksum, originalChecksum, ...c })
					: readStored(s, ledger.id, key).andThen(readFresh),
			),
		),
	);

type DropMissingOptions = { ledger: Ledger; keys: string[] };

/** Forgets the statements whose file is gone, and returns the keys still stored. */
export const dropMissing = ({ ledger, keys }: DropMissingOptions): ResultAsync<string[]> => {
	const folders = [...new Set(keys.map((k) => k.slice(0, k.lastIndexOf('/') + 1)))];
	return openStatements(ledger)
		.andThen((s) => inOrder(folders.map((d) => () => s.list(d))))
		.andThen((listed) => {
			const stored = listed.flat().map((e) => e.key);
			const gone = keys.filter((k) => !stored.includes(k));
			return DB.deleteStatements(ledger.id, gone).map(() => keys.filter((k) => stored.includes(k)));
		});
};

type DeleteStatementsOptions = { ledger: Ledger; keys: string[] };

/** Deletes each statement on its own, so one that fails leaves the rest. */
export const deleteStatements = ({
	ledger,
	keys,
}: DeleteStatementsOptions): ResultAsync<Batch<string>> =>
	openStatements(ledger).andThen((s) =>
		batchInOrder(keys.map((k) => () => deleteStored(s, ledger.id, k))),
	);

const openStatements = (l: Ledger) => openFolder({ ledger: l, folder: 'statements' });

const uploadDay = () => Temporal.Now.plainDateISO().toString().replaceAll('-', '');

const checksum = (c: Uint8Array) => `sha256:${sha256(c)}`;

// A file the table does not know yet, such as one copied into the folder, is recorded as it is read.
const readStored = (storage: Storage, ledgerId: string, key: string): ResultAsync<Stored> =>
	storage.read(key).andThen(({ content }) =>
		DB.findStatement(ledgerId, key).andThen((r) => {
			const sum = checksum(content);
			if (r?.checksum === sum)
				return okAsync({ key, checksum: sum, originalChecksum: r.originalChecksum, content });

			return record(ledgerId, { key, checksum: sum, originalChecksum: null, content });
		}),
	);

const findByKey = (storage: Storage, ledgerId: string, key: string): ResultAsync<DB.StatementRow> =>
	DB.findStatement(ledgerId, key).andThen((r) =>
		r
			? okAsync(r)
			: readStored(storage, ledgerId, key).map((s) => ({
					key: s.key,
					checksum: s.checksum,
					originalChecksum: s.originalChecksum,
				})),
	);

// Follows the content wherever it was moved, forgetting a key whose file is gone.
const findByChecksum = (
	storage: Storage,
	ledgerId: string,
	sum: string,
): ResultAsync<Stored | null> =>
	DB.findStatementByChecksum(ledgerId, sum).andThen((r) => {
		if (!r) return okAsync(null);

		return readStored(storage, ledgerId, r.key)
			.orElse((e) =>
				e.type === 'StorageNotFound'
					? DB.deleteStatements(ledgerId, [r.key]).map(() => null)
					: errAsync(e),
			)
			.andThen((s) =>
				s?.checksum === sum || s?.originalChecksum === sum
					? okAsync(s)
					: findByChecksum(storage, ledgerId, sum),
			);
	});

const deleteStored = (storage: Storage, ledgerId: string, key: string): ResultAsync<string> =>
	storage
		.delete(key)
		.andThen(() => DB.deleteStatements(ledgerId, [key]))
		.map(() => key);

const writeNew = (o: Storage, id: string, s: Stored): ResultAsync<Stored> =>
	writeNumbered(o, s.key, s.content).andThen((e) => record(id, { ...s, key: e.key }));

type Replacement = { key: string; content: Uint8Array };

// The checksum it had before, such as a PDF's while locked, still finds it.
const replace = (storage: Storage, ledgerId: string, { key, content }: Replacement) =>
	findByKey(storage, ledgerId, key).andThen((r) =>
		storage.write({ key, content }).andThen(() =>
			record(ledgerId, {
				key,
				checksum: checksum(content),
				originalChecksum: r.originalChecksum ?? r.checksum,
				content,
			}),
		),
	);

const record = (ledgerId: string, s: Stored): ResultAsync<Stored> =>
	DB.saveStatement(ledgerId, {
		key: s.key,
		checksum: s.checksum,
		originalChecksum: s.originalChecksum,
	}).map(() => s);

const readFresh = (s: Stored): ResultAsync<Statement> =>
	readContents({ name: s.key, content: s.content }).andThen((r) => remember(statementOf(s, r)));

const cached = (s: Stored): ResultAsync<Statement> =>
	DB.findStatementContents({ checksum: s.checksum, reader: READER_VERSION }).andThen((c) =>
		c ? okAsync(statementOf(s, c)) : readFresh(s),
	);

const statementOf = (s: Stored, c: Contents): Statement => ({
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
