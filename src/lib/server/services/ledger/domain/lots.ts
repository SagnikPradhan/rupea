import { v7 as uuidv7 } from 'uuid';
import { unitPrice } from './prices';
import {
	DEFAULT_COMMODITY,
	DisposalKind,
	LotOrigin,
	min,
	movesInKind,
	multiply,
	sum,
	type Amount,
	type LotCost,
	type Price,
	type Quantity,
} from './types';

const FREE: Quantity = { amount: 0n as Amount, commodity: DEFAULT_COMMODITY };

/** A posting in the commodity being booked, in ledger order; `held` when its account is a balance account. */
export type BookedPosting = {
	id: string;
	transaction: string;
	account: string;
	held: boolean;
	date: Temporal.PlainDate;
	amount: Amount;
	price: Price | null;
	cost: LotCost | null;
};

/** `source` is the lot a transfer moved this one from. */
export type Lot = {
	id: string;
	posting: string;
	source: string | null;
	account: string;
	origin: LotOrigin;
	date: Temporal.PlainDate;
	units: Amount;
	remaining: Amount;
	cost: Quantity;
};

/** `lot` is null for units no open lot covers. */
export type Disposal = {
	lot: string | null;
	posting: string;
	kind: DisposalKind;
	units: Amount;
	price: Quantity | null;
};

export type Booking = { lots: Lot[]; disposals: Disposal[] };

type Piece = { lot: Lot; units: Amount };

export const book = (postings: BookedPosting[]): Booking => {
	const booking: Booking = { lots: [], disposals: [] };

	for (const transaction of Map.groupBy(postings, (p) => p.transaction).values()) {
		const held = transaction.filter((p) => p.held);
		const kind = disposalKind(transaction);

		const moving = held
			.filter((p) => p.amount < 0n)
			.flatMap((p) => takeOut({ booking, posting: p, kind }));
		for (const posting of held.filter((p) => p.amount > 0n)) bringIn({ booking, posting, moving });
	}

	return booking;
};

export const realised = (units: Amount, price: Quantity | null, cost: Quantity): Quantity | null =>
	price === null || price.commodity !== cost.commodity
		? null
		: {
				amount: multiply(-units as Amount, (price.amount - cost.amount) as Amount),
				commodity: cost.commodity,
			};

const disposalKind = (transaction: BookedPosting[]) => {
	if (!movesInKind(transaction.map((p) => p.amount))) return DisposalKind.Sale;

	const arriving = transaction.some((p) => p.held && p.amount > 0n);
	return arriving ? DisposalKind.Transfer : DisposalKind.Gift;
};

type TakeOut = { booking: Booking; posting: BookedPosting; kind: DisposalKind };

const takeOut = ({ booking, posting, kind }: TakeOut): Piece[] => {
	const lots = openLotsFor(booking, posting);
	const unnamedSale = kind === DisposalKind.Sale && posting.cost === null;

	if (unnamedSale && lots.length === 0) {
		openLot({ booking, posting, origin: LotOrigin.Short, cost: unitPrice(posting) ?? FREE });
		return [];
	}

	const pieces = takeFromLots({ booking, posting, kind, lots: unnamedSale ? [] : lots });
	return kind === DisposalKind.Transfer ? pieces : [];
};

type BringIn = { booking: Booking; posting: BookedPosting; moving: Piece[] };

const bringIn = ({ booking, posting, moving }: BringIn) => {
	if (posting.cost !== null) {
		const lots = openLotsFor(booking, posting);
		takeFromLots({ booking, posting, kind: DisposalKind.Cover, lots });
		return;
	}
	if (posting.price !== null) {
		openLot({ booking, posting, origin: LotOrigin.Buy, cost: unitPrice(posting) ?? FREE });
		return;
	}

	receiveTransfer({ booking, posting, moving });
};

const receiveTransfer = ({ booking, posting, moving }: BringIn) => {
	const received: Amount[] = [];

	for (const piece of [...moving]) {
		const units = min(piece.units, (posting.amount - sum(received)) as Amount);
		if (units === 0n) break;

		openLot({
			booking,
			posting,
			origin: LotOrigin.Transfer,
			cost: piece.lot.cost,
			units,
			from: piece.lot,
		});
		received.push(units);
		piece.units = (piece.units - units) as Amount;
		if (piece.units === 0n) moving.shift();
	}

	const rest = (posting.amount - sum(received)) as Amount;
	if (rest > 0n) openLot({ booking, posting, origin: LotOrigin.Unpriced, cost: FREE, units: rest });
};

type Taking = { booking: Booking; posting: BookedPosting; kind: DisposalKind; lots: Lot[] };

const takeFromLots = ({ booking, posting, kind, lots }: Taking): Piece[] => {
	const sign = posting.amount < 0n ? -1n : 1n;
	const wanted = (sign * posting.amount) as Amount;
	const traded = kind === DisposalKind.Sale || kind === DisposalKind.Cover;
	const price = traded ? unitPrice(posting) : null;

	const pieces: Piece[] = [];
	for (const lot of lots) {
		const units = min(
			(wanted - sum(pieces.map((p) => p.units))) as Amount,
			(sign * -lot.remaining) as Amount,
		);
		if (units === 0n) break;

		lot.remaining = (lot.remaining + sign * units) as Amount;
		pieces.push({ lot, units });
	}

	const uncovered = (wanted - sum(pieces.map((p) => p.units))) as Amount;
	const taken = [...pieces, ...(uncovered > 0n ? [{ lot: null, units: uncovered }] : [])];
	booking.disposals.push(
		...taken.map((p) => ({
			lot: p.lot?.id ?? null,
			posting: posting.id,
			kind,
			units: (sign * p.units) as Amount,
			price,
		})),
	);

	return pieces;
};

type Opening = {
	booking: Booking;
	posting: BookedPosting;
	origin: LotOrigin;
	cost: Quantity;
	units?: Amount;
	from?: Lot;
};

const openLot = ({ booking, posting, origin, cost, units = posting.amount, from }: Opening) =>
	booking.lots.push({
		id: uuidv7(),
		posting: posting.id,
		source: from?.id ?? null,
		account: posting.account,
		origin,
		date: from?.date ?? posting.date,
		units,
		remaining: units,
		cost,
	});

const openLotsFor = (booking: Booking, posting: BookedPosting): Lot[] =>
	booking.lots
		.filter(
			(l) =>
				l.account === posting.account &&
				l.remaining * posting.amount < 0n &&
				(posting.cost === null || isNamedBy(l, posting.cost)),
		)
		.toSorted((a, b) => Temporal.PlainDate.compare(a.date, b.date));

const isNamedBy = (l: Lot, c: LotCost) =>
	l.cost.amount === c.amount &&
	l.cost.commodity === c.commodity &&
	(c.date === null || c.date.equals(l.date));
