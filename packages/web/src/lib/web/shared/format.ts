import type { Grain } from '@rupea/shared/dates.ts';
import { DEFAULT_COMMODITY } from '@rupea/shared/money.ts';

const LOCALE = 'en-IN';

/** How the country of each base currency groups and writes its numbers. */
const LOCALES: Record<string, string> = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' };

/** The context key under which a ledger's pages hold its base. */
export const BASE = Symbol('base');

const days = new Intl.DateTimeFormat(LOCALE, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC',
});
const sizes = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const moments = new Intl.DateTimeFormat(LOCALE, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
});
const shortDays = new Intl.DateTimeFormat(LOCALE, {
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC',
});
const months = new Intl.DateTimeFormat(LOCALE, {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC',
});
const monthNames = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });
const longMonths = new Intl.DateTimeFormat(LOCALE, { month: 'long', timeZone: 'UTC' });
const longDays = new Intl.DateTimeFormat(LOCALE, {
	day: 'numeric',
	month: 'long',
	timeZone: 'UTC',
});
const isoDays = new Intl.DateTimeFormat('en-CA');
const UNITS = ['B', 'kB', 'MB'];

/** Formats an ISO date like `2026-08-29`. */
export const formatDate = (d: string) => days.format(new Date(d));

/**
 * Formats the day of a moment, such as a file's last change, in the viewer's
 * time zone.
 */
export const formatMoment = (d: Date) => moments.format(d);

/** Formats a byte count in the largest unit it fills, like `1.2 kB`. */
export const formatSize = (bytes: number) => {
	const power = Math.min(Math.floor(Math.log10(Math.max(bytes, 1)) / 3), UNITS.length - 1);
	return `${sizes.format(bytes / 1000 ** power)} ${UNITS[power]}`;
};

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

/** Formats a UTC day without its year, like `21 Oct`, for chart axes. */
/** Names the bucket an ISO day starts, like 21 Oct, Oct 2026 or 2026. */
export const formatBucket: Record<Grain, (d: string) => string> = {
	day: (d) => shortDays.format(new Date(d)),
	month: (d) => months.format(new Date(d)),
	year: (d) => d.slice(0, 4),
};

/** Names the month of an ISO day without its year, like Oct. */
export const formatMonth = (d: string) => monthNames.format(new Date(d));

/** Spells out the month of an ISO day without its year, like October. */
export const formatMonthName = (d: string) => longMonths.format(new Date(d));

/** Spells out an ISO day without its year, like 31 October. */
export const formatDayMonth = (d: string) => longDays.format(new Date(d));

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

/**
 * Number formats in the style of a base currency's country, such as 12,34,567
 * for INR and 1,234,567 for USD; rupees without a base.
 */
export const formatsIn = (b: string | undefined) => FORMATS[b ?? DEFAULT_COMMODITY] ?? OTHER;

const FORMATS = Object.fromEntries(Object.entries(LOCALES).map(([c, l]) => [c, formatsOf(l)]));
const OTHER = formatsOf('en-US');

function formatsOf(locale: string) {
	const quantities = new Intl.NumberFormat(locale, {
		signDisplay: 'negative',
		maximumFractionDigits: 4,
	});
	const exacts = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 });
	const wholes = new Intl.NumberFormat(locale, {
		signDisplay: 'negative',
		maximumFractionDigits: 0,
	});
	const signedWholes = new Intl.NumberFormat(locale, {
		signDisplay: 'exceptZero',
		maximumFractionDigits: 0,
	});
	const compacts = new Intl.NumberFormat(locale, { notation: 'compact' });
	const shares = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
	const percents = new Intl.NumberFormat(locale, {
		style: 'percent',
		signDisplay: 'exceptZero',
		maximumFractionDigits: 1,
	});

	/** Groups an amount in whole units of the base, like 1,250. */
	const whole = (t: string) => wholes.format(t as Intl.StringNumericLiteral);

	/**
	 * Groups an amount like -1250.50 or 10 AAPL, rounding the base to whole units
	 * and units, as any amount naming a commodity counts, to four places.
	 */
	const amount = (text: string, units = false) => {
		const [figure = '', ...commodity] = text.split(' ');
		const format = units || commodity.length > 0 ? quantities : wholes;
		return [format.format(figure as Intl.StringNumericLiteral), ...commodity].join(' ');
	};

	/**
	 * An amount with every digit, for a tooltip, or nothing when what is shown
	 * already has them all.
	 */
	const exact = (text: string, shown = amount(text)) => {
		const [figure = '', ...commodity] = text.split(' ');
		const all = [exacts.format(figure as Intl.StringNumericLiteral), ...commodity].join(' ');
		return all === shown ? undefined : all;
	};

	/** Formats a number in a few characters, like 12L, for chart axes. */
	const compact = (n: number) => compacts.format(n);

	/** Formats a ratio like 0.251 as a signed percent, +25.1%. */
	const percent = (r: number) => percents.format(r);

	/** A part of a whole, like 12.5%, or nothing without a positive whole. */
	const share = (p: string, w: string) =>
		Number(w) > 0 ? shares.format(Number(p) / Number(w)) : null;

	/**
	 * A gain as a signed share of what it cost, like +25.1%, or nothing without a
	 * positive cost.
	 */
	const gain = (g: string | null, c: string | null) =>
		g === null || c === null || Number(c) <= 0 ? null : percent(Number(g) / Number(c));

	/** How far an amount moved from a start; no percent without a positive start. */
	const change = (start: string, end: string): Change => {
		const from = Number(start);
		const moved = Number(end) - from;

		return {
			amount: signedWholes.format(moved),
			percent: from > 0 ? percent(moved / from) : null,
			negative: moved < 0,
		};
	};

	return { whole, amount, exact, compact, percent, share, gain, change };
}
