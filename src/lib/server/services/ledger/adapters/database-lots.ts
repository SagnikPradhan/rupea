import type { Database } from '#lib/server/db/index.ts';
import { insertAll } from '#lib/server/db/insert.ts';
import type { Tables } from '#lib/server/db/tables.ts';
import { atomically } from '#lib/server/db/atomically.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { attempt, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { ExpressionBuilder } from 'kysely';
import type { Amount, Quantity } from '../domain/amounts';
import { book, realised, type BookedPosting, type Booking } from '../domain/lots';
import { BALANCE_TYPES } from '../domain/taxonomy';
import type { DisposalKind, LotOrigin, RupeaParseLocation } from '../domain/types';
import { ledgerOrder, toCost, toPrice, toQuantity } from './database-queries';

export type UnmatchedDisposal = {
	location: RupeaParseLocation;
	account: string;
	commodity: string;
	kind: DisposalKind;
	units: Amount;
	named: boolean;
};

export type LotHistory = {
	location: RupeaParseLocation;
	date: Temporal.PlainDate;
	origin: LotOrigin;
	from: string | null;
	units: Amount;
	remaining: Amount;
	cost: Quantity;
	disposals: {
		location: RupeaParseLocation;
		date: Temporal.PlainDate;
		kind: DisposalKind;
		units: Amount;
		price: Quantity | null;
		gain: Quantity | null;
	}[];
};

/** Books each commodity's lots again from its counted postings. */
export const rebook = (ledgerId: string, commodities: string[]): ResultAsync<void> =>
	atomically(() =>
		withContext('db')((tx) =>
			attempt(async () => {
				for (const commodity of commodities)
					await bookedPostings(tx, { ledgerId, commodity }) // NOSONAR -- one transaction's connection runs one statement at a time
						.then(book)
						.then((b) => replaceLots(tx, { ledgerId, commodity, booking: b }));
			}),
		),
	);

export const listUnmatched = (ledgerId: string): ResultAsync<UnmatchedDisposal[]> =>
	withContext('db')((db) =>
		attempt(() =>
			db
				.selectFrom('disposals')
				.innerJoin('postings', 'postings.id', 'disposals.postingId')
				.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
				.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
				.select([
					'ledgerFiles.key as file',
					'transactions.line',
					'postings.account',
					'disposals.commodity',
					'disposals.kind',
					'disposals.units',
					'postings.costAmount',
				])
				.where('disposals.ledgerId', '=', ledgerId)
				.where('disposals.lotId', 'is', null)
				.orderBy('ledgerFiles.key')
				.orderBy('transactions.line')
				.execute(),
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

export const listLots = (
	ledgerId: string,
	{ account, commodity }: ListLotsOptions,
): ResultAsync<LotHistory[]> =>
	withContext('db')((db) =>
		attempt(async () => {
			const inHolding = (eb: ExpressionBuilder<Tables, 'lots'>) =>
				eb.and([
					eb('lots.ledgerId', '=', ledgerId),
					eb('lots.account', '=', account),
					eb('lots.commodity', '=', commodity),
				]);

			const lots = await db
				.selectFrom('lots')
				.innerJoin('postings', 'postings.id', 'lots.postingId')
				.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
				.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
				.leftJoin('lots as sourceLot', 'sourceLot.id', 'lots.sourceId')
				.select([
					'lots.id',
					'ledgerFiles.key as file',
					'transactions.line',
					'lots.date',
					'lots.origin',
					'sourceLot.account as from',
					'lots.units',
					'lots.remaining',
					'lots.costAmount',
					'lots.costCommodity',
				])
				.where(inHolding)
				.orderBy('lots.date')
				.orderBy('ledgerFiles.key')
				.orderBy('transactions.line')
				.execute();
			const disposals = await db
				.selectFrom('disposals')
				.innerJoin('lots', 'lots.id', 'disposals.lotId')
				.innerJoin('postings', 'postings.id', 'disposals.postingId')
				.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
				.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
				.select([
					'lots.id as lot',
					'ledgerFiles.key as file',
					'transactions.line',
					'transactions.date',
					'disposals.kind',
					'disposals.units',
					'disposals.priceAmount',
					'disposals.priceCommodity',
				])
				.where(inHolding)
				.orderBy(ledgerOrder('transactions', 'ledgerFiles'))
				.execute();

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

type BookedPostingsOptions = { ledgerId: string; commodity: string };

const bookedPostings = (
	db: Database,
	{ ledgerId, commodity }: BookedPostingsOptions,
): Promise<BookedPosting[]> =>
	db
		.selectFrom('postings')
		.innerJoin('transactions', 'transactions.id', 'postings.transactionId')
		.innerJoin('ledgerFiles', 'ledgerFiles.id', 'transactions.fileId')
		.select([
			'postings.id',
			'postings.transactionId',
			'postings.account',
			'postings.accountType',
			'transactions.date',
			'postings.amount',
			'postings.priceAmount',
			'postings.priceCommodity',
			'postings.priceKind',
			'postings.costAmount',
			'postings.costCommodity',
			'postings.costDate',
		])
		.where('postings.ledgerId', '=', ledgerId)
		.where('postings.commodity', '=', commodity)
		.where('postings.counted', '=', true)
		.orderBy(ledgerOrder('transactions', 'ledgerFiles'))
		.orderBy('postings.position')
		.execute()
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
		.deleteFrom('disposals')
		.where('ledgerId', '=', ledgerId)
		.where('commodity', '=', commodity)
		.execute();
	await db
		.deleteFrom('lots')
		.where('ledgerId', '=', ledgerId)
		.where('commodity', '=', commodity)
		.execute();
	await insertAll(db, 'lots', lotRows);
	await insertAll(db, 'disposals', disposalRows);
};
