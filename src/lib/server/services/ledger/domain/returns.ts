import { AMOUNT_UNIT, sum, type Amount } from './amounts';
import type { ValuedHolding } from './holdings';
import { accountType } from './taxonomy';
import { AccountType } from './types';

const YEAR = 365;
const TOLERANCE = 1e-9;
const STEPS = 100;

/** What flowed into one Assets account on one day in rupees, and how many of its postings had no price. */
export type Flow = { account: string; day: Temporal.PlainDate; amount: Amount; unpriced: number };

/**
 * What flowed into an Assets account and those under it over a span less what flowed out, and its
 * XIRR: per year over a year or more, and over the span itself when shorter. XIRR is null when
 * something had no price or no rate solves it.
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

/** Each Assets account with anything under it: what it held the day before the span, what flowed, and what it held at its end. */
export const returnsOf = ({ accounts, start, end, flows, span }: ReturnsOptions): Returns[] =>
	accounts
		.filter((a) => accountType(a) === AccountType.Assets)
		.flatMap((account) => {
			const under = ({ account: a }: { account: string }) =>
				a === account || a.startsWith(`${account}:`);
			const opening = start.filter(under);
			const closing = end.filter(under);
			const moved = flows.filter(under);
			if (opening.length + closing.length + moved.length === 0) return [];

			const unpriced = [...opening, ...closing].filter((h) => h.value === null).length;
			const missing = unpriced + moved.reduce((n, f) => n + f.unpriced, 0);
			const entries = [
				{ day: span.from.subtract({ days: 1 }), amount: -valueOf(opening) },
				...moved.map((f) => ({ day: f.day, amount: -f.amount })),
				{ day: span.to, amount: valueOf(closing) },
			];
			const rate = missing > 0 ? null : xirrOf(entries);

			return [
				{
					account,
					netIn: sum(moved.map((f) => f.amount)),
					xirr: rate?.xirr ?? null,
					yearly: rate?.yearly ?? false,
					unpriced: missing,
				},
			];
		});

const valueOf = (h: ValuedHolding[]) => sum(h.map((x) => x.value ?? (0n as Amount)));

type Entry = { day: Temporal.PlainDate; amount: bigint };

/**
 * The rate at which every entry, discounted from its own day to the first that moved anything,
 * adds up to zero; entries are paid out when positive. A span covering fewer than a year of days,
 * counting both ends, gives the return over the span rather than per year, as GIPS asks.
 */
const xirrOf = (entries: Entry[]) => {
	const moving = entries.filter((x) => x.amount !== 0n);
	const first = moving.map((x) => x.day).toSorted(Temporal.PlainDate.compare)[0];
	const last = entries
		.map((x) => x.day)
		.toSorted(Temporal.PlainDate.compare)
		.at(-1);
	if (!first || !last) return null;

	const yearsOf = (d: Temporal.PlainDate) => first.until(d).days / YEAR;
	const timed = moving.map((x) => ({
		years: yearsOf(x.day),
		amount: Number(x.amount) / Number(AMOUNT_UNIT),
	}));
	const length = yearsOf(last);
	const covered = first.until(last).days + 1;
	const rate = solve(timed);
	if (rate === null || length === 0) return null;

	return covered >= YEAR
		? { xirr: rate, yearly: true }
		: { xirr: (1 + rate) ** length - 1, yearly: false };
};

type Timed = { years: number; amount: number };

/** Newton's method from 10%, then bisection when it strays below -100% or does not settle. */
const solve = (timed: Timed[]): number | null => {
	const npv = (r: number) => timed.reduce((t, x) => t + x.amount * (1 + r) ** -x.years, 0);
	const slope = (r: number) =>
		timed.reduce((t, x) => t - x.years * x.amount * (1 + r) ** (-x.years - 1), 0);
	const newton = (r: number, steps: number): number | null => {
		const next = r - npv(r) / slope(r);
		if (steps === 0 || !Number.isFinite(next) || next <= -1) return null;

		return Math.abs(next - r) < TOLERANCE ? next : newton(next, steps - 1);
	};

	return newton(0.1, STEPS) ?? bisect(npv, -1 + TOLERANCE, 1);
};

/** Widens the upper bound until the sign changes, then halves the interval. */
const bisect = (npv: (r: number) => number, low: number, high: number): number | null => {
	if (Math.sign(npv(low)) === Math.sign(npv(high)))
		return high < 1e6 ? bisect(npv, low, high * 10) : null;

	const middle = (low + high) / 2;
	if (high - low < TOLERANCE) return middle;

	return Math.sign(npv(middle)) === Math.sign(npv(low))
		? bisect(npv, middle, high)
		: bisect(npv, low, middle);
};
