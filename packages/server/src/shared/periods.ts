type PeriodOptions = { length: 'month' | 'year'; start?: Temporal.PlainDate };

export const periodOf = (day: Temporal.PlainDate, o: PeriodOptions) => {
	const unit = o.length === 'month' ? 'months' : 'years';
	const start = o.start ?? anchorOf(day, o.length);

	const whole = start.until(day, { largestUnit: unit })[unit];
	const stepped = start.add({ [unit]: whole });
	const n = Temporal.PlainDate.compare(stepped, day) > 0 ? whole - 1 : whole;

	return {
		from: start.add({ [unit]: n }),
		to: start.add({ [unit]: n + 1 }).subtract({ days: 1 }),
	};
};

const anchorOf = (d: Temporal.PlainDate, l: 'month' | 'year') =>
	l === 'month' ? d.with({ day: 1 }) : d.with({ month: 1, day: 1 });
