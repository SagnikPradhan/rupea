import { DEFAULT_COMMODITY, multiply, type Amount } from './amounts';

/** What lots took in or gave up at what they cost per unit, on one day, in the commodity they cost in. */
export type CostMove = {
	accountId: string;
	commodity: string;
	cost: string;
	day: Temporal.PlainDate;
	amount: Amount;
};

/** What one unit of a commodity was worth in rupees on a day. */
export type RateThen = { commodity: string; day: Temporal.PlainDate; rate: Amount };

type CostOnOptions = { moves: CostMove[]; rates: RateThen[]; days: Temporal.PlainDate[] };

/**
 * What the lots had cost in rupees by the end of each day: the sum of every move up to it, each
 * valued at the price of its own day. A move whose cost commodity had no price then is left out.
 */
export const costOn = ({ moves, rates, days }: CostOnOptions): Amount[] => {
	const rateOf = ratesIn(rates);
	const valued = moves
		.map((m) => ({ day: m.day, value: rupees(m, rateOf) }))
		.toSorted((a, b) => Temporal.PlainDate.compare(a.day, b.day));
	const running: Running[] = [];
	for (const v of valued)
		running.push({ day: v.day, total: (running.at(-1)?.total ?? 0n) + v.value });

	const cursor = { at: 0 };

	return days.map((day) => {
		while (isOn(running[cursor.at + 1], day)) cursor.at++;
		const latest = running[cursor.at];
		return (isOn(latest, day) ? latest.total : 0n) as Amount;
	});
};

/** The commodities lots cost in whose price was missing on a day they were paid in, which costOn leaves out. */
export const unpricedIn = (moves: CostMove[], rates: RateThen[]): string[] => {
	const rateOf = ratesIn(rates);
	const missing = moves.filter(
		(m) => m.cost !== DEFAULT_COMMODITY && !rateOf.has(`${m.cost} ${m.day}`),
	);

	return [...new Set(missing.map((m) => m.cost))];
};

type Running = { day: Temporal.PlainDate; total: bigint };

const isOn = (r: Running | undefined, d: Temporal.PlainDate): r is Running =>
	r !== undefined && Temporal.PlainDate.compare(r.day, d) <= 0;

const ratesIn = (rates: RateThen[]) => {
	const entries = rates.map((r) => [`${r.commodity} ${r.day}`, r.rate] as const);
	return new Map(entries);
};

const rupees = (move: CostMove, rates: Map<string, Amount>) => {
	if (move.cost === DEFAULT_COMMODITY) return move.amount;
	const rate = rates.get(`${move.cost} ${move.day}`);
	return rate === undefined ? 0n : multiply(move.amount, rate);
};
