const LOCALE = 'en-IN';

/** The spans net worth is charted over, by how the range picker labels them. */
export const RANGES = { '1m': '1M', ytd: 'YTD', '1y': '1Y' };

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

/** Reads the `range` query parameter, falling back to the year so far. */
export const rangeOf = (r: string | null) => (r === '1m' || r === '1y' ? r : 'ytd');

/** How net worth moved from the first day to the one shown; no percent without a positive start. */
export const changeOf = (first: { worth: string }, shown: { worth: string }) => {
	const start = Number(first.worth);
	const change = Number(shown.worth) - start;

	return {
		amount: signed.format(change),
		percent: start > 0 ? percents.format(change / start) : null,
		negative: change < 0,
	};
};
