import { v7 as uuidv7 } from 'uuid';
import { DEFAULT_COMMODITY, min, multiply, sum, type Amount, type Quantity } from './amounts';
import { unitPrice } from './prices';
import { DisposalKind, LotOrigin, type LotCost, type Price } from './types';

const FREE: Quantity = { amount: 0n as Amount, commodity: DEFAULT_COMMODITY };

/** ISO 4217 codes, which are held as money rather than in lots. */
export const CURRENCIES = Intl.supportedValuesOf('currency');

export const hasLots = (c: string) => !CURRENCIES.includes(c);

/** A commodity moves in kind when its units in a transaction net to zero, so lot costs only pick lots. */
export const movesInKind = (u: Amount[]) => sum(u) === 0n;

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
	const openLots = openLotsFor(booking, posting);
	const unnamedSale = kind === DisposalKind.Sale && posting.cost === null;

	// No existing lots to sell, we open a short position
	if (unnamedSale && openLots.length === 0) {
		openLot({ booking, posting, origin: LotOrigin.Short, cost: unitPrice(posting) ?? FREE });
		return [];
	}

	const pieces = takeFromLots({ booking, posting, kind, lots: unnamedSale ? [] : openLots });
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

	// You send 8 shares out: 5 bought in January and 3 bought in March. Two accounts get 4 each.
	// The first gets 4 January shares. The second gets the last January share and the 3 March
	// shares. Each new lot keeps the date and cost of the shares it came from.
	// Each pass takes min(what the piece still carries, what the account still needs):
	// the first account gets min(5, 4) = 4, the second min(1, 4) = 1 and then min(3, 3) = 3.
	// An empty piece leaves moving, so the next account starts where this one stopped.
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
	// Oldest shares go first. You bought 5 in January and 10 in March, and now sell 8:
	// the January lot gives all 5, the March lot gives 3 and keeps 7.
	// Each pass takes min(what the sale still needs, what the lot has left):
	// min(8, 5) = 5 from January, then min(3, 10) = 3 from March, and lowers the lot's remaining.
	// Buying back a short sale works the same way, but short lots hold negative units,
	// so sign flips them positive before they are compared.
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
