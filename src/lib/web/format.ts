const LOCALE = 'en-IN';

const numbers = new Intl.NumberFormat(LOCALE, {
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

const UNITS = ['B', 'kB', 'MB'];

/** Groups the number in an amount like `-1250.50` or `10 AAPL`, keeping every digit. */
export const formatAmount = (text: string) => {
	const [amount = '', ...commodity] = text.split(' ');
	return [numbers.format(amount as Intl.StringNumericLiteral), ...commodity].join(' ');
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
