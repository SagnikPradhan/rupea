import * as dateFns from 'date-fns';
import { memo } from './memo';

/** Day before month: `MM/dd/yyyy` would read `03/04/2026` the other way. */
export const DATE_FORMATS = [
	'yyyy-MM-dd',
	'yyyy/MM/dd',
	'dd-MM-yyyy',
	'd-M-yyyy',
	'dd/MM/yyyy',
	'd/M/yyyy',
	'd MMM yyyy',
	'd MMMM yyyy',
	'MMM d, yyyy',
	'MMMM d, yyyy',
];

export const TIME_FORMATS = ['HH:mm', 'H:mm', 'HH:mm:ss', 'H:mm:ss', 'h:mm a', 'h:mm:ss a'];

/** Enough for the dates of a large file, and small enough to keep on a shared server. */
const REMEMBERED = 10_000;

/** date-fns fills fields a format leaves out with the 1st, January or 1970, so this avoids all three. */
const SAMPLE = new Date(2026, 7, 29, 14, 30);

export type ReadOptions = { format: string; text: string; reference?: Date | undefined };

/** Remembered, as a ledger reads the same dates in every format on every header. */
export const parseDate = memo({
	fn: (o: ReadOptions): Temporal.PlainDate | null => {
		const d = read(o);
		return d
			? Temporal.PlainDate.from({
					year: d.getFullYear(),
					month: d.getMonth() + 1,
					day: d.getDate(),
				})
			: null;
	},
	size: REMEMBERED,
});

export const parseTime = memo({
	fn: (o: ReadOptions): Temporal.PlainTime | null => {
		const t = read(o);
		return t
			? Temporal.PlainTime.from({
					hour: t.getHours(),
					minute: t.getMinutes(),
					second: t.getSeconds(),
				})
			: null;
	},
	size: REMEMBERED,
});

export const isDateFormat = (f: string, r?: Date): boolean =>
	parseDate({ format: f, text: dateFns.format(SAMPLE, f), reference: r })?.equals('2026-08-29') ??
	false;

export const isTimeFormat = (f: string): boolean =>
	parseTime({ format: f, text: dateFns.format(SAMPLE, f) })?.equals('14:30') ?? false;

/** Strict, so a list of formats never reads one text two ways. */
const read = (o: ReadOptions): Date | null => {
	const d = dateFns.parse(o.text, o.format, o.reference ?? new Date(0));
	return dateFns.isValid(d) && dateFns.format(d, o.format).toLowerCase() === o.text.toLowerCase()
		? d
		: null;
};
