import { anyOf, noneOf } from '#lib/server/db/expressions.ts';
import { ROWS_PER_STATEMENT, type Database } from '#lib/server/db/index.ts';
import { fault, type RupeaError } from '@rupea/shared/errors.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { v7 as uuidv7 } from 'uuid';
import { displayLocation } from '../domain/parser';
import { marketPrices } from '../domain/prices';
import { INDEXER } from '../domain/sync';
import { accountType } from '../domain/taxonomy';
import {
	ProblemKind,
	type RupeaLedgerFile,
	type RupeaMetadata,
	type RupeaTransaction,
} from '../domain/types';
import type { OldTransaction, TransactionRow } from './database-files-diff';

/** The parser already refuses these; checked again so no posting goes unindexed. */
export const untypedAccount = (file: RupeaLedgerFile): RupeaError | null =>
	file.transactions
		.flatMap((t) =>
			t.postings
				.filter((p) => !accountType(p.account))
				.map((p) =>
					fault('ParseInvalidAccount', {
						location: displayLocation(t.location),
						account: p.account,
					}),
				),
		)
		.at(0) ?? null;

type VersionOptions = { ledgerId: string; key: string; version: string };

export const saveVersion = (db: Database, { ledgerId, key, version }: VersionOptions) =>
	db
		.insertInto('ledgerFiles')
		.values({ ledgerId, key, version, indexer: INDEXER })
		.onConflict((o) => o.columns(['ledgerId', 'key']).doUpdateSet({ version, indexer: INDEXER }))
		.returning('id')
		.executeTakeFirstOrThrow()
		.then((f) => f.id);

/** Deleting a posting takes its metadata, lots and disposals with it by cascade. */
export const deleteOwnedBy = async (db: Database, transactions: string[]) => {
	await db
		.deleteFrom('metadata')
		.where((e) => anyOf(e.ref('transactionId').$notNull(), transactions, 'uuid'))
		.execute();
	await db
		.deleteFrom('postings')
		.where((e) => anyOf(e.ref('transactionId'), transactions, 'uuid'))
		.execute();
};

/**
 * A kept transaction keeps whether it counts, which settling decides, and its
 * embedding.
 */
export const saveTransactions = async (db: Database, rows: TransactionRow[]) => {
	for (const chunk of chunks(rows, ROWS_PER_STATEMENT))
		await db // NOSONAR -- a transaction's statements share one connection, so they run in turn
			.insertInto('transactions')
			.values(chunk)
			.onConflict((o) =>
				o.column('id').doUpdateSet((e) => ({
					line: e.ref('excluded.line'),
					comment: e.ref('excluded.comment'),
					hash: e.ref('excluded.hash'),
				})),
			)
			.execute();
};

type RowsOptions = {
	ledgerId: string;
	fileId: string;
	file: RupeaLedgerFile;
	failed: RupeaError[];
	lineHashes: Record<number, string>;
	matchOf: (t: RupeaTransaction) => OldTransaction | undefined;
};

/**
 * Each table's rows for a parsed file, its prices and links still to be put on
 * their symbols.
 */
export const rowsOf = ({ ledgerId, fileId, file, failed, lineHashes, matchOf }: RowsOptions) => {
	const indexed = file.transactions.map((t) => {
		const match = matchOf(t);

		return {
			id: match?.id ?? uuidv7(),
			counted: match?.counted ?? true,
			transaction: t,
			postings: t.postings.map((p) => ({ id: uuidv7(), posting: p })),
		};
	});

	const transactions = indexed.map(({ id, counted, transaction }) => ({
		id,
		counted,
		ledgerId,
		fileId,
		line: transaction.location.line,
		date: transaction.date.toString(),
		time: transaction.time?.toString() ?? null,
		description: transaction.description,
		comment: transaction.comment,
		hash: lineHashes[transaction.location.line] ?? null,
	}));
	const postings = indexed.flatMap(({ id, counted, transaction, postings: p }) =>
		p.flatMap(({ id: postingId, posting }, position) => {
			const type = accountType(posting.account);
			return type
				? [
						{
							account: posting.account,
							row: {
								id: postingId,
								ledgerId,
								transactionId: id,
								counted,
								date: transaction.date.toString(),
								position,
								accountType: type,
								amount: posting.amount,
								commodity: posting.commodity,
								priceAmount: posting.price?.amount ?? null,
								priceCommodity: posting.price?.commodity ?? null,
								priceKind: posting.price?.kind ?? null,
								costAmount: posting.cost?.amount ?? null,
								costCommodity: posting.cost?.commodity ?? null,
								costDate: posting.cost?.date?.toString() ?? null,
								balance: posting.balance,
								comment: posting.comment,
							},
						},
					]
				: [];
		}),
	);
	const prices = marketPrices(file).map((p) => ({
		symbol: p.commodity,
		row: {
			fileId,
			line: p.location.line,
			date: p.date.toString(),
			priceAmount: p.price.amount,
			priceCommodity: p.price.commodity,
			source: p.source,
		},
	}));
	const links = file.links.map((l) => ({
		feed: l.feed,
		symbol: l.symbol,
		row: {
			ledgerId,
			alias: l.commodity,
			since: l.since?.toString() ?? null,
			fileId,
			line: l.location.line,
		},
	}));
	const accounts = file.accounts.map((a) => ({
		ledgerId,
		account: a.account,
		since: a.since?.toString() ?? null,
		terms: a.metadata,
		fileId,
		line: a.location.line,
	}));
	const metadata = [
		...ownedBy({ ledgerId, fileId }, file.metadata),
		...indexed.flatMap(({ id, transaction }) =>
			ownedBy({ ledgerId, transactionId: id }, transaction.metadata),
		),
		...indexed.flatMap(({ postings: p }) =>
			p.flatMap(({ id, posting }) => ownedBy({ ledgerId, postingId: id }, posting.metadata)),
		),
	];

	const problems = failed.map((e) => ({ ledgerId, fileId, kind: ProblemKind.Parse, error: e }));

	return { transactions, postings, prices, links, accounts, metadata, problems };
};

/**
 * Deletes a file's transactions that no new row kept, by id, and rows without
 * an embedding take their description's. The select still sees the deleted
 * rows, as Postgres runs a statement on one snapshot, so the update keeps to
 * the others.
 */
export const replaceOldTransactions = (db: Database, fileId: string, unmatched: string[]) =>
	db
		.with('deleted', (db) =>
			db
				.deleteFrom('transactions')
				.where((e) => anyOf(e.ref('transactions.id'), unmatched, 'uuid')),
		)
		.with('embedded', (db) =>
			db
				.selectFrom('transactions')
				.select(['description', 'embedding', 'embeddingModel'])
				.distinctOn('description')
				.where('fileId', '=', fileId)
				.where('embedding', 'is not', null),
		)
		.updateTable('transactions')
		.from('embedded')
		.set((e) => ({
			embedding: e.ref('embedded.embedding'),
			embeddingModel: e.ref('embedded.embeddingModel'),
		}))
		.where('transactions.fileId', '=', fileId)
		.where('transactions.embedding', 'is', null)
		.whereRef('transactions.description', '=', 'embedded.description')
		.where((e) => noneOf(e.ref('transactions.id'), unmatched, 'uuid'))
		.execute();

type MetadataOwner = { ledgerId: string } & (
	{ fileId: string } | { transactionId: string } | { postingId: string }
);

const ownedBy = (o: MetadataOwner, m: RupeaMetadata) =>
	Object.entries(m)
		.flatMap(([key, values]) => values.map((v) => ({ key, value: v })))
		.map((e, i) => ({ ...o, position: i, ...e }));
