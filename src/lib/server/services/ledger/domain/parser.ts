/**
 * The `.rupee` format: a header line `<date> [time] <description>`, followed
 * by one tab-indented posting per line, `<account> [amount]`. Blank
 * (whitespace-only) lines may separate transactions; a blank line ends the
 * postings above it. Dates and times may be written in any of the configured
 * formats.
 *
 *     2026-08-29 18:45 Groceries
 *     	Expenses:Food 100
 *     	Assets:Bank
 *
 *     30 Aug 2026 Salary
 *     	Assets:Bank 50000
 *     	Income:Salary
 */
import * as dateFns from 'date-fns';
import { match, P } from 'ts-pattern';
import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import { batch, err, ok, type Batch, type Result } from '#lib/server/shared/result.ts';
import {
	AMOUNT_SCALE,
	type Amount,
	type RupeeFile,
	type RupeeParseLocation,
	type RupeePosting,
	type RupeeTransaction,
} from './types';

export const displayLocation = ({ file, line }: RupeeParseLocation): string => `${file}:${line}`;

export type RupeeLine = { location: RupeeParseLocation; content: string };

export const parse = (
	c: RupeeConfiguration,
	{ key, content }: Pick<RupeeFile, 'key' | 'content'>,
): Batch<RupeeTransaction> => parseTransactions(c, lines(key, content));

const lines = (file: string, content: string): RupeeLine[] =>
	content
		.split('\n')
		.slice(0, content.endsWith('\n') ? -1 : undefined)
		.map((text, index) => ({
			location: { file, line: index + 1 },
			content: text,
		}));

/**
 * Parse consecutive transactions. A bad posting does not sink its
 * transaction, but an unreadable header stops the parse: without it there is
 * no telling where the next transaction starts.
 */
export const parseTransactions = (
	configuration: RupeeConfiguration,
	input: RupeeLine[],
): Batch<RupeeTransaction> => {
	const lines = [...input];
	const results: Result<RupeeTransaction>[] = [];
	for (const line of drain(lines)) {
		if (isBlank(line)) continue;
		const header = parseHeader(configuration, line);
		if (header.isErr()) return batch([...results, err(header.error)]);

		const body = batch(takeWhile(lines, isPosting).map(parsePosting));
		results.push(...body.failed.map((e) => err(e)));
		switch (true) {
			case body.succeeded.length > 0:
				results.push(
					ok({
						location: line.location,
						...header.value,
						postings: body.succeeded,
					}),
				);
				break;
			case body.failed.length === 0:
				results.push(missingBody(line.location));
				break;
		}
	}
	return batch(results);
};

/** Shift items off `stack` until it is empty; the loop body may take more. */
function* drain<T>(sk: T[]): Generator<T> {
	while (sk.length > 0) yield* sk.splice(0, 1);
}

/** Remove and return the leading items of `stack` that satisfy `keep`. */
const takeWhile = <T>(stack: T[], keep: (item: T) => boolean): T[] => {
	const end = stack.findIndex((i) => !keep(i));
	return stack.splice(0, end < 0 ? stack.length : end);
};

/** Whitespace-only lines separate transactions and are otherwise ignored. */
const isBlank = ({ content }: RupeeLine) => content.trim() === '';

const isPosting = (l: RupeeLine) => l.content.startsWith('\t') && !isBlank(l);

const missingBody = (location: RupeeParseLocation): Result<never> =>
	err({
		type: 'ParseMissingTransactionBody',
		location: displayLocation(location),
		cause: [],
	});

export const parseHeader = (
	{ dateFormats, timeFormats }: RupeeConfiguration,
	{ location, content }: RupeeLine,
): Result<{
	date: Temporal.PlainDate;
	time: Temporal.PlainTime | null;
	description: string;
}> => {
	const words = content.trim().split(/\s+/);
	const date = readWords(dateFormats, words, parseDate);
	const time = date ? readWords(timeFormats, date.rest, parseTime) : undefined;
	const description = (time ?? date)?.rest.join(' ');
	return date && description
		? ok({ date: date.value, time: time?.value ?? null, description })
		: err({
				type: 'ParseInvalidTransactionHeader',
				location: displayLocation(location),
				cause: [],
			});
};

/**
 * Read the leading words with whichever of `formats` fits the most of them,
 * the earliest on a tie, returning the value and the words after it. A
 * format with spaces (`h:mm a`) spans as many words, so `9:15 pm` is read
 * whole rather than as `9:15` by `H:mm`.
 */
const readWords = <T>(
	formats: string[],
	words: string[],
	read: (options: ParseOptions) => T | null,
): { value: T; rest: string[] } | undefined =>
	formats
		.flatMap((format) => {
			const length = format.trim().split(/\s+/).length;
			const value = read({ format, text: words.slice(0, length).join(' ') });
			return value === null ? [] : [{ value, rest: words.slice(length) }];
		})
		.sort((a, b) => a.rest.length - b.rest.length)
		.at(0);

export const parsePosting = ({ location, content }: RupeeLine): Result<RupeePosting> => {
	const invalid: RupeeError = {
		type: 'ParseInvalidPosting',
		location: displayLocation(location),
		cause: [],
	};
	const words = content.split(/\s+/).filter(Boolean);
	return match(words)
		.with([P.string.minLength(1)], ([account]) => ok({ account, amount: null }))
		.with([P.string.minLength(1), P.string.minLength(1)], ([account, text]) => {
			const amount = parseAmount(text);
			return amount ? ok({ account, amount }) : err(invalid);
		})
		.otherwise(() => err(invalid));
};

/**
 * Read the leading number of `text`, ignoring `₹` and thousands separators
 * (`₹1,250.50` → 1250.5). Text after the number is ignored, but more than
 * `AMOUNT_SCALE` decimal places is rejected rather than cut off.
 */
export const parseAmount = (text: string): Amount | null => {
	const cleaned = text.replaceAll(',', '').replaceAll('₹', '').trim();
	const match = /^([+-]?)(\d+)(?:\.(\d+))?/.exec(cleaned);
	if (!match?.[2]) return null;
	const [, sign, whole, fraction = ''] = match;
	if (fraction.length > AMOUNT_SCALE) return null;
	const units = BigInt(whole + fraction.padEnd(AMOUNT_SCALE, '0'));
	return (sign === '-' ? -units : units) as Amount;
};

/**
 * Parse `text` against a date-fns format. Strict: the text must be exactly
 * what the format would write, up to case, so `dd/MM/yyyy` takes
 * `09/08/2026` but neither `9/8/2026` nor `09/08/26`. That keeps a list of
 * formats from reading one text two ways. A two-digit year (`yy`) reads as
 * the one within 50 years of `reference`.
 */
type ParseOptions = {
	format: string;
	text: string;
};

const read = ({
	format,
	text,
	reference = new Date(0),
}: ParseOptions & { reference?: Date | undefined }): Date | null => {
	const date = dateFns.parse(text, format, reference);
	return dateFns.isValid(date) && dateFns.format(date, format).toLowerCase() === text.toLowerCase()
		? date
		: null;
};

type ParseDateOptions = ParseOptions & {
	/** What a two-digit year is read relative to. */
	reference?: Date | undefined;
};

/**
 * Parse `text` against a date-fns date format (`yyyy-MM-dd`, `d MMM yyyy`);
 * anything else the format reads is dropped. Check the format with
 * `isDateFormat` first: date-fns throws on unknown tokens, and fills in
 * fields the format leaves out.
 */
export const parseDate = (options: ParseDateOptions): Temporal.PlainDate | null => {
	const date = read(options);
	return date
		? Temporal.PlainDate.from({
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				day: date.getDate(),
			})
		: null;
};

/** Parse `text` against a date-fns time format (`HH:mm`, `h:mm a`). */
export const parseTime = (options: ParseOptions): Temporal.PlainTime | null => {
	const time = read(options);
	return time
		? Temporal.PlainTime.from({
				hour: time.getHours(),
				minute: time.getMinutes(),
				second: time.getSeconds(),
			})
		: null;
};

/**
 * Whether `format` is a date-fns format that pins down a whole date: a day
 * written with it reads back as that day. date-fns fills a field the format
 * leaves out with the 1st, January or 1970, so the sample avoids all three.
 * A two-digit year passes only with a `reference` within 50 years of 2026.
 * Throws `RangeError` on unknown tokens.
 */
export const isDateFormat = (format: string, reference?: Date): boolean =>
	parseDate({
		format,
		text: dateFns.format(new Date(2026, 7, 29), format),
		reference,
	})?.equals('2026-08-29') === true;

/**
 * Whether `format` is a date-fns format that pins down an hour and minute:
 * an afternoon time written with it reads back as that time. A missing field
 * reads as 0, and a 12-hour clock without AM/PM reads it as morning.
 * Throws `RangeError` on unknown tokens.
 */
export const isTimeFormat = (format: string): boolean =>
	parseTime({
		format,
		text: dateFns.format(new Date(2026, 7, 29, 14, 30), format),
	})?.equals('14:30') === true;
