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
	const rateOf = new Map(rates.map((r) => [`${r.commodity} ${r.day}`, r.rate]));
	const valued = moves
		.map((m) => ({ day: m.day, value: rupees(m, rateOf) }))
		.toSorted((a, b) => Temporal.PlainDate.compare(a.day, b.day));
	const running: { day: Temporal.PlainDate; total: bigint }[] = [];
	for (const v of valued)
		running.push({ day: v.day, total: (running.at(-1)?.total ?? 0n) + v.value });

	const ahead = [...running];

	return days.map((day) => {
		while (ahead[1] && Temporal.PlainDate.compare(ahead[1].day, day) <= 0) ahead.shift();
		const latest = ahead[0];
		return (
			latest && Temporal.PlainDate.compare(latest.day, day) <= 0 ? latest.total : 0n
		) as Amount;
	});
};

const rupees = (move: CostMove, rates: Map<string, Amount>) => {
	if (move.cost === DEFAULT_COMMODITY) return move.amount;
	const rate = rates.get(`${move.cost} ${move.day}`);
	return rate === undefined ? 0n : multiply(move.amount, rate);
};
