import { AMOUNT_UNIT, sum, type Amount } from './amounts';
import type { ValuedHolding } from './holdings';
import { accountType, parentsOf } from './taxonomy';
import { AccountType } from './types';

const YEAR = 365;
const TOLERANCE = 1e-9;
const STEPS = 100;
const GUESS = 0.1;
const RATES = [
	-0.99999,
	-0.9999,
	-0.999,
	-0.99,
	-0.9,
	-0.5,
	0,
	GUESS,
	1,
	10,
	100,
	1e3,
	1e4,
	1e5,
	1e6,
];
const POWER_DIGITS = 290;

/**
 * What flowed into one Assets account on one day in rupees, and how many of its
 * postings had no price. The day is a day number, as dayNumberOf gives.
 */
export type Flow = { account: string; day: number; amount: Amount; unpriced: number };

/**
 * What flowed into an Assets account and those under it over a span less what
 * flowed out, and its XIRR: per year over a year or more, and over the span
 * itself when shorter. XIRR is null when something had no price or no rate
 * solves it.
 */
export type Returns = {
	account: string;
	netIn: Amount;
	xirr: number | null;
	yearly: boolean;
	unpriced: number;
};

type ReturnsOptions = {
	accounts: string[];
	start: ValuedHolding[];
	end: ValuedHolding[];
	flows: Flow[];
	span: { from: Temporal.PlainDate; to: Temporal.PlainDate };
};

/**
 * Each Assets account with anything under it: what it held the day before the
 * span, what flowed, and what it held at its end.
 */
export const returnsOf = ({ accounts, start, end, flows, span }: ReturnsOptions): Returns[] => {
	const returns: Returns[] = [];
	const flowing = movedBy(flows);

	const isUnpriced = (h: ValuedHolding) => h.value === null;
	const valueOf = (h: ValuedHolding[]) => sum(h.map((x) => x.value ?? (0n as Amount)));

	for (const account of accounts) {
		if (accountType(account) !== AccountType.Assets) continue;

		const isUnderAccount = (a: string) => a === account || a.startsWith(account + ':');
		const opening = start.filter((x) => isUnderAccount(x.account));
		const closing = end.filter((x) => isUnderAccount(x.account));
		const moved = flowing[account] ?? { net: 0n as Amount, unpriced: 0, days: {} };
		const days = Object.entries(moved.days);
		if (opening.length + closing.length + days.length === 0) continue;

		const missing =
			opening.filter(isUnpriced).length + closing.filter(isUnpriced).length + moved.unpriced;

		const entries = [
			{ n: dayNumberOf(span.from.toString()) - 1, amount: -valueOf(opening) },
			...days.map(([n, amount]) => ({ n: Number(n), amount: -amount })),
			{ n: dayNumberOf(span.to.toString()), amount: valueOf(closing) },
		];
		const rate = missing > 0 ? null : xirrOf(entries);

		returns.push({
			account,
			netIn: moved.net,
			xirr: rate?.xirr ?? null,
			yearly: rate?.yearly ?? false,
			unpriced: missing,
		});
	}

	return returns;
};

type Moved = { net: Amount; unpriced: number; days: Record<number, bigint> };

/**
 * What flowed into each account and every account above it: the net, the
 * unpriced postings and the amount on each day number.
 */
const movedBy = (flows: Flow[]) => {
	const byAccount: Record<string, Moved> = {};

	for (const f of flows)
		for (const account of parentsOf(f.account)) {
			const moved = (byAccount[account] ??= { net: 0n as Amount, unpriced: 0, days: {} });
			moved.net = (moved.net + f.amount) as Amount;
			moved.unpriced += f.unpriced;
			moved.days[f.day] = (moved.days[f.day] ?? 0n) + f.amount;
		}

	return byAccount;
};

type Entry = { n: number; amount: bigint };

/**
 * The rate at which every entry, discounted from its own day to the first that
 * moved anything, adds up to zero; entries are paid out when positive. A span
 * covering fewer than a year of days, counting both ends, gives the return over
 * the span rather than per year, as GIPS asks.
 */
const xirrOf = (entries: Entry[]) => {
	const moving = entries.filter((x) => x.amount !== 0n);
	const first = moving.reduce((n, x) => Math.min(n, x.n), Infinity);
	const last = entries.reduce((n, x) => Math.max(n, x.n), -Infinity);
	if (moving.length === 0) return null;

	const timed = moving.map((x) => ({
		years: (x.n - first) / YEAR,
		amount: Number(x.amount) / Number(AMOUNT_UNIT),
	}));
	const length = (last - first) / YEAR;
	const covered = last - first + 1;
	const rate = solve(timed);
	if (rate === null || length === 0) return null;

	return covered >= YEAR
		? { xirr: rate, yearly: true }
		: { xirr: (1 + rate) ** length - 1, yearly: false };
};

/** The days since 1970-01-01 of a date as 2026-10-05. */
export const dayNumberOf = (d: string) => Date.parse(d) / 86_400_000;

type Timed = { years: number; amount: number };

type Point = { x: number; y: number };

/**
 * The ends of the interval holding the rate, a the worse and b the better, the
 * point before b and the one before that, whether the last step halved the
 * interval, and the steps left.
 */
type Bracket = { a: Point; b: Point; c: Point; d: Point; halved: boolean; steps: number };

/**
 * The rate at which the entries add up to zero, found by Brent's method inside
 * the interval between two rates of a fixed ladder where they change sign; with
 * several such intervals, the one nearest 10%. The lowest rate is the one whose
 * power over the longest entry stays below what a float holds, and none is
 * below -100%.
 */
const solve = (timed: Timed[]): number | null => {
	const npv = (r: number) => timed.reduce((t, x) => t + x.amount * (1 + r) ** -x.years, 0);
	const longest = timed.reduce((n, x) => Math.max(n, x.years), 0);
	const low = -1 + Math.max(TOLERANCE, 10 ** (-POWER_DIGITS / longest));
	const points = [low, ...RATES.filter((r) => r > low)].map((x) => ({ x, y: npv(x) }));
	const sides = points.slice(1).map((q, i) => ({ p: points[i] ?? q, q }));
	const nearness = ({ p, q }: { p: Point; q: Point }) =>
		Math.min(Math.abs(p.x - GUESS), Math.abs(q.x - GUESS));
	const changing = sides
		.filter(({ p, q }) => Number.isFinite(p.y) && Number.isFinite(q.y))
		.filter(({ p, q }) => Math.sign(p.y) !== Math.sign(q.y))
		.toSorted((u, v) => nearness(u) - nearness(v))[0];

	return changing ? brent(npv, bracketOf(changing.p, changing.q)) : null;
};

const bracketOf = (p: Point, q: Point): Bracket => {
	const [a, b] = Math.abs(p.y) < Math.abs(q.y) ? [q, p] : [p, q];

	return { a, b, c: a, d: a, halved: true, steps: STEPS };
};

/**
 * Each step guesses by inverse quadratic interpolation through the last three
 * points, or by the secant through the ends when two share a value, and halves
 * the interval instead when the guess is not well inside it or is not closing
 * in fast enough. See https://en.wikipedia.org/wiki/Brent%27s_method
 */
const brent = (
	npv: (r: number) => number,
	{ a, b, c, d, halved, steps }: Bracket,
): number | null => {
	if (b.y === 0 || Math.abs(b.x - a.x) < TOLERANCE) return b.x;
	if (steps === 0) return null;

	const quadratic =
		(a.x * b.y * c.y) / ((a.y - b.y) * (a.y - c.y)) +
		(b.x * a.y * c.y) / ((b.y - a.y) * (b.y - c.y)) +
		(c.x * a.y * b.y) / ((c.y - a.y) * (c.y - b.y));
	const secant = b.x - (b.y * (b.x - a.x)) / (b.y - a.y);
	const guess = a.y !== c.y && b.y !== c.y ? quadratic : secant;

	const quarter = (3 * a.x + b.x) / 4;
	const inside = guess > Math.min(quarter, b.x) && guess < Math.max(quarter, b.x);
	const before = halved ? b.x - c.x : c.x - d.x;
	const closing = Math.abs(guess - b.x) < Math.abs(before) / 2 && Math.abs(before) >= TOLERANCE;
	const halve = !inside || !closing;

	const x = halve ? (a.x + b.x) / 2 : guess;
	const point = { x, y: npv(x) };
	const [low, high] = Math.sign(a.y) !== Math.sign(point.y) ? [a, point] : [point, b];
	const [worse, better] = Math.abs(low.y) < Math.abs(high.y) ? [high, low] : [low, high];

	return brent(npv, { a: worse, b: better, c: b, d: c, halved: halve, steps: steps - 1 });
};
