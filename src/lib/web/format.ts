const LOCALE = 'en-IN';

const rupees = new Intl.NumberFormat(LOCALE, {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});
const quantities = new Intl.NumberFormat(LOCALE, {
	minimumFractionDigits: 2,
	maximumFractionDigits: 4,
});
const exacts = new Intl.NumberFormat(LOCALE, {
	minimumFractionDigits: 2,
	maximumFractionDigits: 20,
});
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
const isoDays = new Intl.DateTimeFormat('en-CA');
const compacts = new Intl.NumberFormat(LOCALE, { notation: 'compact' });
const signed = new Intl.NumberFormat(LOCALE, {
	signDisplay: 'exceptZero',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});
const percents = new Intl.NumberFormat(LOCALE, {
	style: 'percent',
	signDisplay: 'exceptZero',
	maximumFractionDigits: 1,
});

const UNITS = ['B', 'kB', 'MB'];

/** Groups an amount like -1250.50 or 10 AAPL, rounding rupees to two places and units, as any amount naming a commodity counts, to four. */
export const formatAmount = (text: string, units = false) => {
	const [amount = '', ...commodity] = text.split(' ');
	const format = units || commodity.length > 0 ? quantities : rupees;
	return [format.format(amount as Intl.StringNumericLiteral), ...commodity].join(' ');
};

/** An amount with every digit, for a tooltip, or nothing when formatAmount already shows them all. */
export const formatExact = (text: string, units = false) => {
	const [amount = '', ...commodity] = text.split(' ');
	const exact = [exacts.format(amount as Intl.StringNumericLiteral), ...commodity].join(' ');
	return exact === formatAmount(text, units) ? undefined : exact;
};

/** Formats an ISO date like `2026-08-29`. */
export const formatDate = (d: string) => days.format(new Date(d));

/** Formats the day of a moment, such as a file's last change, in the viewer's time zone. */
export const formatMoment = (d: Date) => moments.format(d);

/** Formats a byte count in the largest unit it fills, like `1.2 kB`. */
export const formatSize = (bytes: number) => {
	const power = Math.min(Math.floor(Math.log10(Math.max(bytes, 1)) / 3), UNITS.length - 1);
	return `${sizes.format(bytes / 1000 ** power)} ${UNITS[power]}`;
};

/** Formats the day of a moment in the viewer's time zone as an ISO date, like `2026-10-21`. */
export const formatIsoDate = (d: Date) => isoDays.format(d);

/** Formats a UTC day without its year, like `21 Oct`, for chart axes. */
export const formatShortDate = (d: Date) => shortDays.format(d);

/** Formats a number in a few characters, like `12L`, for chart axes. */
export const formatCompact = (n: number) => compacts.format(n);

/** Formats a ratio like `0.251` as a signed percent, `+25.1%`. */
export const formatPercent = (r: number) => percents.format(r);

/** How far an amount moved from a start; no percent without a positive start. */
export const formatChange = (start: string, end: string) => {
	const from = Number(start);
	const change = Number(end) - from;

	return {
		amount: signed.format(change),
		percent: from > 0 ? formatPercent(change / from) : null,
		negative: change < 0,
	};
};
