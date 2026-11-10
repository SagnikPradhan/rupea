import { shownDays, type Move } from './worth';

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
 * Chains each day's price-only change into an index of what the holdings would
 * be worth had nothing been put in or taken out, and measures it against its
 * high so far. The underwater line is of all parts together; long spans keep
 * each stretch's lowest and highest days, and the last. A part that held
 * nothing priced has no low; lows come worst first. A part's swing is the
 * spread of its daily moves over the days it moved at all, since a day without
 * a new price would understate it, scaled to a year, and is left out below
 * MOST_QUIET such days.
 */
export const dropsOf = (from: Temporal.PlainDate, moves: Move[]): Drops => {
	const together = depthsOf({
		before: sumByDay(moves.map((m) => m.before)),
		after: sumByDay(moves.map((m) => m.after)),
	});

	return {
		underwater: shownDays(together).map((i) => ({
			day: from.add({ days: i }),
			depth: together[i] ?? 0,
		})),
		lows: moves
			.filter((m) => m.before.some((b) => b > 0n))
			.map((m) => {
				const depths = depthsOf(m);
				const lowest = depths.reduce((l, d, i) => (d < (depths[l] ?? d) ? i : l), 0);

				return { account: m.part, depth: depths[lowest] ?? 0, day: from.add({ days: lowest }) };
			})
			.toSorted((a, b) => a.depth - b.depth),
		swings: moves.flatMap((m) => {
			const swing = swingOf(m);
			return swing === null ? [] : [{ account: m.part, swing }];
		}),
	};
};

const sumByDay = (series: bigint[][]) => {
	const days = series[0] ?? [];
	return days.map((_, i) => series.reduce((t, s) => t + (s[i] ?? 0n), 0n));
};

/** The index of a part against its running high, one depth for each day. */
const depthsOf = ({ before, after }: { before: bigint[]; after: bigint[] }) => {
	const index = before.reduce<number[]>((chain, was, i) => {
		const latest = chain.at(-1) ?? 1;
		chain.push(was > 0n ? (latest * Number(after[i])) / Number(was) : latest);
		return chain;
	}, []);
	const highs = index.reduce<number[]>((chain, x) => {
		chain.push(Math.max(chain.at(-1) ?? x, x));
		return chain;
	}, []);

	return index.map((x, i) => x / (highs[i] ?? x) - 1);
};

/** The yearly spread of the days a part moved on, or null with too few of them. */
const swingOf = ({ before, after }: { before: bigint[]; after: bigint[] }) => {
	const moves = before.flatMap((was, i) => {
		const now = after[i] ?? was;
		return was > 0n && now !== was ? [Number(now) / Number(was) - 1] : [];
	});
	if (moves.length < MOST_QUIET) return null;

	const mean = moves.reduce((t, r) => t + r, 0) / moves.length;
	const variance = moves.reduce((t, r) => t + (r - mean) ** 2, 0) / (moves.length - 1);

	return Math.sqrt(variance * TRADING_DAYS);
};
