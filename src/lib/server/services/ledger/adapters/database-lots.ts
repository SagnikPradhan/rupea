import { ROWS_PER_STATEMENT, type Database } from '#lib/server/db/index.ts';
import { chunks } from '#lib/server/shared/arrays.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Amount, Quantity } from '../domain/amounts';
import { book, realised, type BookedPosting, type Booking } from '../domain/lots';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { DisposalKind, LotOrigin, RupeeParseLocation } from '../domain/types';
import {
	disposals as disposalTable,
	ledgerFiles,
	lots as lotTable,
	postings,
	transactions as transactionTable,
} from './database-schema';
import { toCost, toPrice, toQuantity } from './database-transactions';

const LEDGER_ORDER = [
	asc(transactionTable.date),
	sql`${transactionTable.time} asc nulls first`,
	asc(ledgerFiles.key),
	asc(transactionTable.line),
];

export type UnmatchedDisposal = {
	location: RupeeParseLocation;
	account: string;
	commodity: string;
	kind: DisposalKind;
	units: Amount;
	named: boolean;
};

export type LotHistory = {
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	origin: LotOrigin;
	from: string | null;
	units: Amount;
	remaining: Amount;
	cost: Quantity;
	disposals: {
		location: RupeeParseLocation;
		date: Temporal.PlainDate;
		kind: DisposalKind;
		units: Amount;
		price: Quantity | null;
		gain: Quantity | null;
	}[];
};

/** Books each commodity's lots again from its counted postings. */
export const rebook = (
	ledgerId: string,
	commodities: string[],
	uncounted: string[],
): ResultAsync<void> =>
	withContext('db')((db) =>
		attempt(() =>
			db.transaction(async (tx) => {
				for (const commodity of commodities)
					await bookedPostings(tx, { ledgerId, commodity, uncounted })
						.then(book)
						.then((b) => replaceLots(tx, { ledgerId, commodity, booking: b }));
			}),
		),
	);

export const listUnmatched = (ledgerId: string): ResultAsync<UnmatchedDisposal[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.select({
					file: ledgerFiles.key,
					line: transactionTable.line,
					account: postings.account,
					commodity: disposalTable.commodity,
					kind: disposalTable.kind,
					units: disposalTable.units,
					costAmount: postings.costAmount,
				})
				.from(disposalTable)
				.innerJoin(postings, eq(postings.id, disposalTable.postingId))
				.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
				.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
				.where(and(eq(disposalTable.ledgerId, ledgerId), isNull(disposalTable.lotId)))
				.orderBy(asc(ledgerFiles.key), asc(transactionTable.line)),
		).map((rows) =>
			rows.map((row) => ({
				location: { file: row.file, line: row.line },
				account: row.account,
				commodity: row.commodity,
				kind: row.kind,
				units: row.units as Amount,
				named: row.costAmount !== null,
			})),
		),
	);

type ListLotsOptions = { account: string; commodity: string };

const sourceLot = alias(lotTable, 'source_lot');

export const listLots = (
	ledgerId: string,
	{ account, commodity }: ListLotsOptions,
): ResultAsync<LotHistory[]> =>
	withContext('db')((db) =>
		attempt(async () => {
			const inHolding = and(
				eq(lotTable.ledgerId, ledgerId),
				eq(lotTable.account, account),
				eq(lotTable.commodity, commodity),
			);

			const lots = await db
				.select({
					id: lotTable.id,
					file: ledgerFiles.key,
					line: transactionTable.line,
					date: lotTable.date,
					origin: lotTable.origin,
					from: sourceLot.account,
					units: lotTable.units,
					remaining: lotTable.remaining,
					costAmount: lotTable.costAmount,
					costCommodity: lotTable.costCommodity,
				})
				.from(lotTable)
				.innerJoin(postings, eq(postings.id, lotTable.postingId))
				.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
				.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
				.leftJoin(sourceLot, eq(sourceLot.id, lotTable.sourceId))
				.where(inHolding)
				.orderBy(asc(lotTable.date), ...LEDGER_ORDER.slice(2));
			const disposals = await db
				.select({
					lot: lotTable.id,
					file: ledgerFiles.key,
					line: transactionTable.line,
					date: transactionTable.date,
					kind: disposalTable.kind,
					units: disposalTable.units,
					priceAmount: disposalTable.priceAmount,
					priceCommodity: disposalTable.priceCommodity,
				})
				.from(disposalTable)
				.innerJoin(lotTable, eq(lotTable.id, disposalTable.lotId))
				.innerJoin(postings, eq(postings.id, disposalTable.postingId))
				.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
				.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
				.where(inHolding)
				.orderBy(...LEDGER_ORDER);

			const byLot = Object.groupBy(disposals, (d) => d.lot);
			return lots.map((lot) => ({
				location: { file: lot.file, line: lot.line },
				date: Temporal.PlainDate.from(lot.date),
				origin: lot.origin,
				from: lot.from,
				units: lot.units as Amount,
				remaining: lot.remaining as Amount,
				cost: { amount: lot.costAmount as Amount, commodity: lot.costCommodity },
				disposals: (byLot[lot.id] ?? []).map((disposal) => {
					const units = disposal.units as Amount;
					const price = toQuantity({
						amount: disposal.priceAmount,
						commodity: disposal.priceCommodity,
					});
					const cost = { amount: lot.costAmount as Amount, commodity: lot.costCommodity };

					return {
						location: { file: disposal.file, line: disposal.line },
						date: Temporal.PlainDate.from(disposal.date),
						kind: disposal.kind,
						units,
						price,
						gain: realised(units, price, cost),
					};
				}),
			}));
		}),
	);

type BookedPostingsOptions = { ledgerId: string; commodity: string; uncounted: string[] };

const bookedPostings = (
	db: Database,
	{ ledgerId, commodity, uncounted }: BookedPostingsOptions,
): Promise<BookedPosting[]> =>
	db
		.select({
			id: postings.id,
			transactionId: postings.transactionId,
			account: postings.account,
			accountType: postings.accountType,
			date: transactionTable.date,
			amount: postings.amount,
			priceAmount: postings.priceAmount,
			priceCommodity: postings.priceCommodity,
			priceKind: postings.priceKind,
			costAmount: postings.costAmount,
			costCommodity: postings.costCommodity,
			costDate: postings.costDate,
		})
		.from(postings)
		.innerJoin(transactionTable, eq(transactionTable.id, postings.transactionId))
		.innerJoin(ledgerFiles, eq(ledgerFiles.id, transactionTable.fileId))
		.where(
			and(
				eq(postings.ledgerId, ledgerId),
				eq(postings.commodity, commodity),
				sql`${transactionTable.id} <> all(${sql.param(uncounted)}::uuid[])`,
			),
		)
		.orderBy(...LEDGER_ORDER, asc(postings.position))
		.then((rows) =>
			rows.map((row) => ({
				id: row.id,
				transaction: row.transactionId,
				account: row.account,
				held: BALANCE_TYPES.some((t) => t === row.accountType),
				date: Temporal.PlainDate.from(row.date),
				amount: row.amount as Amount,
				price: toPrice(row),
				cost: toCost(row),
			})),
		);

type ReplaceLotsOptions = { ledgerId: string; commodity: string; booking: Booking };

const replaceLots = async (db: Database, { ledgerId, commodity, booking }: ReplaceLotsOptions) => {
	const lotRows = booking.lots.map((lot) => ({
		id: lot.id,
		ledgerId,
		commodity,
		postingId: lot.posting,
		sourceId: lot.source,
		account: lot.account,
		origin: lot.origin,
		date: lot.date.toString(),
		units: lot.units,
		remaining: lot.remaining,
		costAmount: lot.cost.amount,
		costCommodity: lot.cost.commodity,
	}));
	const disposalRows = booking.disposals.map((disposal) => ({
		ledgerId,
		commodity,
		lotId: disposal.lot,
		postingId: disposal.posting,
		kind: disposal.kind,
		units: disposal.units,
		priceAmount: disposal.price?.amount ?? null,
		priceCommodity: disposal.price?.commodity ?? null,
	}));

	await db
		.delete(disposalTable)
		.where(and(eq(disposalTable.ledgerId, ledgerId), eq(disposalTable.commodity, commodity)));
	await db
		.delete(lotTable)
		.where(and(eq(lotTable.ledgerId, ledgerId), eq(lotTable.commodity, commodity)));
	for (const chunk of chunks(lotRows, ROWS_PER_STATEMENT)) await db.insert(lotTable).values(chunk);
	for (const chunk of chunks(disposalRows, ROWS_PER_STATEMENT))
		await db.insert(disposalTable).values(chunk);
};
