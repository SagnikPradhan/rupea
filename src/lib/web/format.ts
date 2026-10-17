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

/** Groups the number in an amount like `-1250.50` or `10 AAPL`, keeping every digit. */
export const formatAmount = (text: string) => {
	const [amount = '', ...commodity] = text.split(' ');
	return [numbers.format(amount as Intl.StringNumericLiteral), ...commodity].join(' ');
};

/** Formats an ISO date like `2026-08-29`. */
export const formatDate = (d: string) => days.format(new Date(d));
