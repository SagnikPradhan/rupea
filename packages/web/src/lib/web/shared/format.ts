import type { Grain } from '@rupea/shared/dates.ts';
import {
	DEFAULT_COMMODITY,
	printPosted,
	printQuantity,
	type PostedOut,
	type QuantityOut,
} from '@rupea/shared/money.ts';
import type * as v from 'valibot';

/** How the country of each base currency writes its numbers and dates. */
const LOCALES: Record<string, string> = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' };
const OTHER = 'en-US';

/** The context key under which a ledger's pages hold its base. */
export const BASE = Symbol('base');

const isoDays = new Intl.DateTimeFormat('en-CA');
const UNITS = ['B', 'kB', 'MB'];

/** Numbers and dates, written the way the base currency's country writes them. */
export type Formats = {
	/** The currency an amount is in when it names none. */
	base: string;
	/** An amount in whole units of the base, like 1,250. */
	whole: (t: string) => string;
	/**
	 * An amount like -1250.50 or 10 AAPL: the base in whole units, and units, or
	 * any amount naming a commodity, to four places.
	 */
	amount: (t: string, units?: boolean) => string;
	/**
	 * An amount with every digit, for a tooltip, or nothing when it is shown
	 * whole.
	 */
	exact: (t: string, shown?: string) => string | undefined;
	/** A quantity, naming its commodity unless it is the base. */
	quantity: (q: Quantity) => string;
	/**
	 * A posting's amount with its lot cost and price, naming every commodity but
	 * the base.
	 */
	posted: (p: PostedOut) => string;
	/** A number in a few characters, like 12L, for chart axes. */
	compact: (n: number) => string;
	/** A ratio like 0.251 as a signed percent, +25.1%. */
	percent: (r: number) => string;
	/** A part of a whole, like 12.5%, or nothing without a positive whole. */
	share: (part: string, whole: string) => string | null;
	/**
	 * A gain as a signed share of its cost, like +25.1%, or nothing without a
	 * positive cost.
	 */
	gain: (gain: string | null, cost: string | null) => string | null;
	/** How far an amount moved from a start; no percent without a positive start. */
	change: (start: string, end: string) => Change;
	/** A byte count in the largest unit it fills, like 1.2 MB. */
	size: (bytes: number) => string;
	/** An ISO date, like 29 Aug 2026. */
	date: (d: string) => string;
	/**
	 * The day of a moment, such as a file's last change, in the viewer's time
	 * zone.
	 */
	moment: (d: Date) => string;
	/** The bucket an ISO day starts, like 21 Oct, Oct 2026 or 2026. */
	bucket: Record<Grain, (d: string) => string>;
	/** The month of an ISO day without its year, like Oct. */
	month: (d: string) => string;
	/** The month of an ISO day spelled out, like October. */
	monthName: (d: string) => string;
	/** An ISO day spelled out without its year, like 31 October. */
	dayMonth: (d: string) => string;
};

type Quantity = v.InferOutput<typeof QuantityOut>;

/** The formats of a base currency, or of rupees without one. */
export const formatsIn = (b: string | undefined): Formats => {
	const base = b ?? DEFAULT_COMMODITY;
	MADE[base] ??= formatsOf(base);
	return MADE[base];
};

const MADE: Record<string, Formats> = {};

/** A spreadsheet's name for a column, counting from 0: A to Z, then AA. */
export const formatColumn = (index: number): string => {
	const prefix = index >= 26 ? formatColumn(Math.floor(index / 26) - 1) : '';
	return prefix + String.fromCodePoint(65 + (index % 26));
};

/**
 * Formats the day of a moment in the viewer's time zone as an ISO date, like
 * `2026-10-21`.
 */
export const formatIsoDate = (d: Date) => isoDays.format(d);

/** The tone of a number: positive above zero, negative below, none at zero. */
export const toneOf = (n: number) => {
	if (n > 0) return 'positive';
	if (n < 0) return 'negative';
	return undefined;
};

/**
 * How far an amount moved: signed amount, percent of the start, and its
 * direction.
 */
export type Change = { amount: string; percent: string | null; negative: boolean };

function formatsOf(base: string): Formats {
	const locale = LOCALES[base] ?? OTHER;
	const numbers = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, o);
	const dates = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o);

	const quantities = numbers({ signDisplay: 'negative', maximumFractionDigits: 4 });
	const exacts = numbers({ maximumFractionDigits: 20 });
	const wholes = numbers({ signDisplay: 'negative', maximumFractionDigits: 0 });
	const signedWholes = numbers({ signDisplay: 'exceptZero', maximumFractionDigits: 0 });
	const compacts = numbers({ notation: 'compact' });
	const shares = numbers({ style: 'percent', maximumFractionDigits: 1 });
	const percents = numbers({
		style: 'percent',
		signDisplay: 'exceptZero',
		maximumFractionDigits: 1,
	});
	const sizes = numbers({ maximumFractionDigits: 1 });

	const days = dates({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
	const moments = dates({ day: 'numeric', month: 'short', year: 'numeric' });
	const shortDays = dates({ day: 'numeric', month: 'short', timeZone: 'UTC' });
	const months = dates({ month: 'short', year: 'numeric', timeZone: 'UTC' });
	const monthNames = dates({ month: 'short', timeZone: 'UTC' });
	const longMonths = dates({ month: 'long', timeZone: 'UTC' });
	const longDays = dates({ day: 'numeric', month: 'long', timeZone: 'UTC' });

	const amount = (text: string, units = false) => {
		const [figure = '', ...commodity] = text.split(' ');
		const format = units || commodity.length > 0 ? quantities : wholes;
		return [format.format(figure as Intl.StringNumericLiteral), ...commodity].join(' ');
	};
	const percent = (r: number) => percents.format(r);

	return {
		base,
		whole: (t) => wholes.format(t as Intl.StringNumericLiteral),
		amount,
		exact: (text, shown = amount(text)) => {
			const [figure = '', ...commodity] = text.split(' ');
			const all = [exacts.format(figure as Intl.StringNumericLiteral), ...commodity].join(' ');
			return all === shown ? undefined : all;
		},
		quantity: (q) => printQuantity(q, base),
		posted: (p) => printPosted(p, base),
		compact: (n) => compacts.format(n),
		percent,
		share: (p, w) => (Number(w) > 0 ? shares.format(Number(p) / Number(w)) : null),
		gain: (g, c) =>
			g === null || c === null || Number(c) <= 0 ? null : percent(Number(g) / Number(c)),
		change: (start, end) => {
			const from = Number(start);
			const moved = Number(end) - from;
			return {
				amount: signedWholes.format(moved),
				percent: from > 0 ? percent(moved / from) : null,
				negative: moved < 0,
			};
		},
		size: (bytes) => {
			const power = Math.min(Math.floor(Math.log10(Math.max(bytes, 1)) / 3), UNITS.length - 1);
			return `${sizes.format(bytes / 1000 ** power)} ${UNITS[power]}`;
		},
		date: (d) => days.format(new Date(d)),
		moment: (d) => moments.format(d),
		bucket: {
			day: (d) => shortDays.format(new Date(d)),
			month: (d) => months.format(new Date(d)),
			year: (d) => d.slice(0, 4),
		},
		month: (d) => monthNames.format(new Date(d)),
		monthName: (d) => longMonths.format(new Date(d)),
		dayMonth: (d) => longDays.format(new Date(d)),
	};
}
