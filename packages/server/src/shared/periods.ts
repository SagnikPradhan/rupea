type PeriodOptions = { length: 'month' | 'year'; start?: Temporal.PlainDate };

/**
 * The period holding a day. Periods are the start plus a whole number of units,
 * which clamps to the month's end, so a start on the 31st gives a period from
 * the 28th in February and none of them leaves a gap.
 */
export const periodOf = (day: Temporal.PlainDate, o: PeriodOptions) => {
	const unit = o.length === 'month' ? 'months' : 'years';
	const start = o.start ?? anchorOf(day, o.length);
	const at = (n: number) => start.add({ [unit]: n });
	const after = (d: Temporal.PlainDate) => Temporal.PlainDate.compare(d, day);

	const settle = (n: number): number => {
		if (after(at(n + 1)) <= 0) return settle(n + 1);
		if (after(at(n)) > 0) return settle(n - 1);
		return n;
	};
	const n = settle(start.until(day, { largestUnit: unit })[unit]);

	return { from: at(n), to: at(n + 1).subtract({ days: 1 }) };
};

const anchorOf = (d: Temporal.PlainDate, l: 'month' | 'year') =>
	l === 'month' ? d.with({ day: 1 }) : d.with({ month: 1, day: 1 });
