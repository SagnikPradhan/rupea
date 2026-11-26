import type { Grain } from '@rupea/shared/dates.ts';
import {
	DEFAULT_COMMODITY,
	printPosted,
	printQuantity,
	type PostedOut,
	type QuantityOut,
} from '@rupea/shared/money.ts';
import { getContext } from 'svelte';

/** How the country of each base currency writes its numbers and dates. */
const LOCALES: Record<string, string> = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' };
const OTHER = 'en-US';
const UNITS = ['B', 'kB', 'MB'];

/** The context key under which a ledger's pages hold a getter for its base. */
export const BASE = Symbol('base');

const MADE: Record<string, Formats> = {};
const isoDays = new Intl.DateTimeFormat('en-CA');

/** Numbers and dates, written the way the base currency's country writes them. */
export type Formats = {
	/** The currency an amount is in when it names none. */
	base: string;
	/** An amount in whole units of the base, like 1,250. */
	whole: (t: string) => string;
	/**
	 * The base in whole units, and units or an amount naming a commodity to four
	 * places.
	 */
	amount: (t: string, units?: boolean) => string;
	/**
	 * An amount with every digit for a tooltip, or nothing when it is shown
	 * whole.
	 */
	exact: (t: string, shown?: string) => string | undefined;
	/** A quantity, naming its commodity unless it is the base. */
	quantity: (q: QuantityOut) => string;
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
	/** A gain as a signed share of its cost, or nothing without a positive cost. */
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

/** The formats of a base currency, or of rupees without one. */
export const formatsIn = (b: string | undefined): Formats => {
	const base = b ?? DEFAULT_COMMODITY;
	MADE[base] ??= { base, ...numbersIn(base), ...datesIn(LOCALES[base] ?? OTHER) };
	return MADE[base];
};

/** The formats of the ledger the page is in; called while a component starts. */
export const formatsHere = () => formatsIn(getContext<(() => string) | undefined>(BASE)?.());

/** A spreadsheet's name for a column, counting from 0: A to Z, then AA. */
export const formatColumn = (index: number): string => {
	const prefix = index >= 26 ? formatColumn(Math.floor(index / 26) - 1) : '';
	return prefix + String.fromCodePoint(65 + (index % 26));
};

/**
 * The day of a moment in the viewer's time zone as an ISO date, like
 * 2026-10-21.
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

function numbersIn(base: string) {
	const numbers = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(LOCALES[base] ?? OTHER, o);

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

	const amount = (text: string, units = false) => {
		const [figure = '', ...commodity] = text.split(' ');
		const format = units || commodity.length > 0 ? quantities : wholes;
		return [format.format(figure as Intl.StringNumericLiteral), ...commodity].join(' ');
	};
	const exact = (text: string, shown = amount(text)) => {
		const [figure = '', ...commodity] = text.split(' ');
		const all = [exacts.format(figure as Intl.StringNumericLiteral), ...commodity].join(' ');
		return all === shown ? undefined : all;
	};
	const percent = (r: number) => percents.format(r);

	return {
		whole: (t: string) => wholes.format(t as Intl.StringNumericLiteral),
		amount,
		exact,
		quantity: (q: QuantityOut) => printQuantity(q, base),
		posted: (p: PostedOut) => printPosted(p, base),
		compact: (n: number) => compacts.format(n),
		percent,
		share: (p: string, w: string) => (Number(w) > 0 ? shares.format(Number(p) / Number(w)) : null),
		gain: (g: string | null, c: string | null) =>
			g === null || c === null || Number(c) <= 0 ? null : percent(Number(g) / Number(c)),
		change: (start: string, end: string): Change => {
			const moved = Number(end) - Number(start);
			const shift = Number(start) > 0 ? percent(moved / Number(start)) : null;
			return { amount: signedWholes.format(moved), percent: shift, negative: moved < 0 };
		},
		size: (bytes: number) => {
			const power = Math.min(Math.floor(Math.log10(Math.max(bytes, 1)) / 3), UNITS.length - 1);
			return `${sizes.format(bytes / 1000 ** power)} ${UNITS[power]}`;
		},
	};
}

function datesIn(locale: string) {
	const dates = (o: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o });
	const at = (f: Intl.DateTimeFormat) => (d: string) => f.format(new Date(d));
	const moments = new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});

	return {
		date: at(dates({ day: 'numeric', month: 'short', year: 'numeric' })),
		moment: (d: Date) => moments.format(d),
		bucket: {
			day: at(dates({ day: 'numeric', month: 'short' })),
			month: at(dates({ month: 'short', year: 'numeric' })),
			year: (d: string) => d.slice(0, 4),
		},
		month: at(dates({ month: 'short' })),
		monthName: at(dates({ month: 'long' })),
		dayMonth: at(dates({ day: 'numeric', month: 'long' })),
	};
}
