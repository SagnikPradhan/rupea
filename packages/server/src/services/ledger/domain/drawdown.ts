import type { Balances, Series } from './deltas';
import { shownDays } from './worth';

/**
 * How far below its high something stood at the end of a day, as a fraction at
 * or below zero.
 */
type Underwater = { day: Temporal.PlainDate; depth: number };

/** The lowest an account fell below its high, and the day it did. */
type Low = { account: string; depth: number; day: Temporal.PlainDate };

/**
 * How much an account's value swings in a year, as the spread of its daily
 * moves.
 */
type Swing = { account: string; swing: number };

export type Drops = { underwater: Underwater[]; lows: Low[]; swings: Swing[] };

/**
 * The fewest days that moved before an account's swing is said, as less says
 * nothing of a year.
 */
const MOST_QUIET = 60;

/** The days a year of prices moves on. */
const TRADING_DAYS = 252;

/**
 * How near the lowest depth another day's counts as the same low, which is
 * float noise on what would be a tie in exact amounts, so the earliest wins.
 */
const SAME_LOW = 1e-12;

/** A holding that had lots by the end of the span. */
type Held = { name: string; commodity: string };

/**
 * Chains each day's price-only change into an index of what the holdings would
 * be worth had nothing been put in or taken out, and measures it against its
 * high so far. The daily balances give the series of units and price of each
 * holding at the end of each day, and only the holdings that had lots count: a
 * day's price-only change is the units of the day before valued at that day's
 * price less at the day before's, so what was put in or taken out never enters.
 * None comes back for a span in which none was held. The series are floats,
 * which is as exact as a depth or a swing is shown; the rows of the read stay
 * exact. The underwater line is of all accounts together; long spans keep each
 * stretch's lowest and highest days, and the last. A part that held nothing
 * priced has no low; lows come worst first, and a low is the earliest day
 * within SAME_LOW of the lowest. A part's swing is the spread of its daily
 * moves over the days it moved at all, since a day without a new price would
 * understate it, scaled to a year, and is left out below MOST_QUIET such days.
 */
export const dropsOf = (daily: Balances, lotted: Held[]): Drops | null => {
	const series = seriesOf(daily, lotted);
	const count = daily.from.until(daily.to).days + 1;
	const open = series.reduce((first, s) => {
		const day = s.units.findIndex((u) => u !== 0);
		return day >= 0 && day < first ? day : first;
	}, count);
	if (open === count) return null;

	const from = daily.from.add({ days: open });
	const moves = [...Map.groupBy(series, (s) => s.account)].map(([account, held]) =>
		movesOf(account, held, open),
	);
	const together = depthsOf({
		before: sumByDay(moves.map((m) => m.before)),
		after: sumByDay(moves.map((m) => m.after)),
	});

	return {
		underwater: shownDays(Array.from(together)).map((i) => ({
			day: from.add({ days: i }),
			depth: together[i] ?? 0,
		})),
		lows: moves
			.filter((m) => m.before.some((b) => b > 0))
			.map((m) => {
				const depths = depthsOf(m);
				const lowest = depths.reduce((l, d) => (d < l ? d : l), 0);
				const low = depths.findIndex((d) => d <= lowest + SAME_LOW);

				return { account: m.account, depth: depths[low] ?? 0, day: from.add({ days: low }) };
			})
			.toSorted((a, b) => a.depth - b.depth),
		swings: moves.flatMap((m) => {
			const swing = swingOf(m);
			return swing === null ? [] : [{ account: m.account, swing }];
		}),
	};
};

/** The series of the holdings that had lots, which are the ones that count. */
const seriesOf = ({ series = [] }: Balances, lotted: Held[]) => {
	const keys = new Set(lotted.map((h) => `${h.name} ${h.commodity}`));

	return series.filter((s) => keys.has(`${s.account} ${s.commodity}`));
};

/**
 * What an account's holdings of the day before were worth at that day's prices
 * and at the day before's, in step by day from the first, which has neither.
 */
type Move = { account: string; before: Float64Array; after: Float64Array };

/**
 * Values the units each holding held at the end of a day at the price of that
 * day and of the next, from day open. A holding with no price on either day
 * counts on neither.
 */
const movesOf = (account: string, held: Series[], open: number): Move => {
	const days = (held[0]?.prices.length ?? open) - open;
	const before = new Float64Array(days);
	const after = new Float64Array(days);

	held.forEach((h) =>
		h.prices.subarray(open).forEach((now, i) => {
			const was = h.prices[open + i - 1] ?? Number.NaN;
			const units = h.units[open + i - 1] ?? 0;
			if (i === 0 || Number.isNaN(was) || Number.isNaN(now)) return;

			before[i] = (before[i] ?? 0) + units * was;
			after[i] = (after[i] ?? 0) + units * now;
		}),
	);

	return { account, before, after };
};

const sumByDay = (series: Float64Array[]) => {
	const sum = new Float64Array(series[0]?.length ?? 0);
	series.forEach((s) =>
		s.forEach((x, i) => {
			sum[i] = (sum[i] ?? 0) + x;
		}),
	);

	return sum;
};

/** The index of a part against its running high, one depth for each day. */
const depthsOf = ({ before, after }: Pick<Move, 'before' | 'after'>) => {
	const depths = new Float64Array(before.length);
	const run = { latest: 1, high: Number.NEGATIVE_INFINITY };

	before.forEach((was, i) => {
		run.latest = was > 0 ? (run.latest * (after[i] ?? 0)) / was : run.latest;
		run.high = Math.max(run.high, run.latest);
		depths[i] = run.latest / run.high - 1;
	});

	return depths;
};

/** The yearly spread of the days a part moved on, or null with too few of them. */
const swingOf = ({ before, after }: Move) => {
	const moves = Array.from(before).flatMap((was, i) => {
		const now = after[i] ?? was;
		return was > 0 && now !== was ? [now / was - 1] : [];
	});
	if (moves.length < MOST_QUIET) return null;

	const mean = moves.reduce((t, r) => t + r, 0) / moves.length;
	const variance = moves.reduce((t, r) => t + (r - mean) ** 2, 0) / (moves.length - 1);

	return Math.sqrt(variance * TRADING_DAYS);
};
