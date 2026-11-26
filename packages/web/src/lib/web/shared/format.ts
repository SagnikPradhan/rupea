import type { Grain } from '@rupea/shared/dates.ts';
import { DEFAULT_COMMODITY, type PostedOut, type QuantityOut } from '@rupea/shared/money.ts';
import { getContext } from 'svelte';

const LOCALES: Record<string, string> = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' };
const OTHER = 'en-US';
const UNITS = ['B', 'kB', 'MB'];
const SIGNS = { unit: '@', total: '@@' };

export const BASE = Symbol('base');

const MADE: Record<string, Formats> = {};
const isoDays = new Intl.DateTimeFormat('en-CA');

export type Formats = {
	base: string;
	whole: (amount: string) => string;
	units: (amount: string) => string;
	exact: (amount: string, shown?: string) => string | undefined;
	quantity: (q: QuantityOut | PostedOut) => string;
	suffix: (q: QuantityOut | PostedOut) => string;
	compact: (n: number) => string;
	percent: (ratio: number) => string;
	share: (part: string, whole: string) => string | null;
	gain: (gain: string | null, cost: string | null) => string | null;
	change: (start: string, end: string) => Change;
	size: (bytes: number) => string;
	date: (isoDay: string) => string;
	moment: (d: Date) => string;
	bucket: Record<Grain, (isoDay: string) => string>;
	month: (isoDay: string) => string;
	monthName: (isoDay: string) => string;
	dayMonth: (isoDay: string) => string;
};

export const formatsIn = (b: string | undefined): Formats => {
	const base = b ?? DEFAULT_COMMODITY;
	MADE[base] ??= { base, ...numbersIn(base), ...datesIn(LOCALES[base] ?? OTHER) };
	return MADE[base];
};

export const formatsHere = () => formatsIn(getContext<(() => string) | undefined>(BASE)?.());

export const formatColumn = (index: number): string => {
	const prefix = index >= 26 ? formatColumn(Math.floor(index / 26) - 1) : '';
	return prefix + String.fromCodePoint(65 + (index % 26));
};

export const formatIsoDate = (d: Date) => isoDays.format(d);

export const toneOf = (n: number) => {
	if (n > 0) return 'positive';
	if (n < 0) return 'negative';
	return undefined;
};

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

	const whole = (a: string) => wholes.format(a as Intl.StringNumericLiteral);
	const units = (a: string) => quantities.format(a as Intl.StringNumericLiteral);
	const percent = (r: number) => percents.format(r);

	const quantity = (q: QuantityOut | PostedOut): string =>
		[units(q.amount), suffix(q)].filter(Boolean).join(' ');
	const suffix = (q: QuantityOut | PostedOut): string => {
		const named = q.commodity === base ? [] : [q.commodity];
		const cost =
			'cost' in q && q.cost
				? [`{${[quantity(q.cost), q.cost.date].filter(Boolean).join(', ')}}`]
				: [];
		const price = 'price' in q && q.price ? [SIGNS[q.price.kind], quantity(q.price)] : [];
		return [...named, ...cost, ...price].join(' ');
	};

	return {
		whole,
		units,
		exact: (a: string, shown = whole(a)) => {
			const all = exacts.format(a as Intl.StringNumericLiteral);
			return all === shown ? undefined : all;
		},
		quantity,
		suffix,
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
