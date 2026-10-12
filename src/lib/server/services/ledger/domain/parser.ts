import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { type Batch, batch } from '#lib/server/shared/result/batch.ts';
import * as dateFns from 'date-fns';
import { match, P } from 'ts-pattern';
import {
	accountType,
	AMOUNT_SCALE,
	DEFAULT_COMMODITY,
	formatQuantity,
	PriceKind,
	toMetadata,
	weight,
	type Amount,
	type Price,
	type Quantity,
	type RupeeFile,
	type RupeeMetadata,
	type RupeeParseLocation,
	type RupeePosting,
	type RupeeTransaction,
} from './types';

export const displayLocation = ({ file, line }: RupeeParseLocation): string => `${file}:${line}`;

export type RupeeLine = { location: RupeeParseLocation; content: string };

export type RupeeParsedFile = Batch<RupeeTransaction> & { metadata: RupeeMetadata };

// Metadata above the first transaction belongs to the file.
export const parse = (
	c: RupeeConfiguration,
	{ key, content }: Pick<RupeeFile, 'key' | 'content'>,
): RupeeParsedFile => {
	const input = lines(key, content).filter((l) => !isComment(l));
	const preamble = readMetadata(
		takeWhile(input, (l) => isBlank(l) || isMetadata(l)).filter(isMetadata),
	);
	const parsed = parseTransactions(c, input);

	return {
		metadata: preamble.metadata,
		succeeded: parsed.succeeded,
		failed: [...preamble.failed, ...parsed.failed],
	};
};

const lines = (file: string, content: string): RupeeLine[] =>
	content
		.split('\n')
		.slice(0, content.endsWith('\n') ? -1 : undefined)
		.map((text, index) => ({
			location: { file, line: index + 1 },
			content: text,
		}));

// A commodity left out is filled in: the home one for amounts and prices, the
// posting's own for a balance.
type WrittenQuantity = { amount: Amount; commodity: string | null };

type WrittenPosting = {
	account: string;
	quantity: WrittenQuantity | null;
	price: Price | null;
	balance: WrittenQuantity | null;
};

type MetadataPosting = WrittenPosting & { metadata: RupeeMetadata };

// A bad posting or metadata line drops its transaction; a bad header stops the
// parse, since there is no telling where the next transaction starts.
export const parseTransactions = (
	configuration: RupeeConfiguration,
	input: RupeeLine[],
): Batch<RupeeTransaction> => {
	const lines = input.filter((l) => !isComment(l));
	const results: Result<RupeeTransaction>[] = [];
	for (const line of drain(lines)) {
		if (isBlank(line)) continue;
		if (isMetadata(line)) {
			results.push(
				err(fault('ParseDetachedMetadata', { location: displayLocation(line.location) })),
			);
			continue;
		}

		const header = parseHeader(configuration, line);
		if (header.isErr()) return batch([...results, err(header.error)]);

		const body = readBody(takeWhile(lines, (l) => isPosting(l) || isMetadata(l)));
		results.push(...body.failed.map(err));
		if (body.failed.length > 0) continue;

		results.push(
			balance(line.location, body.postings).map((postings) => ({
				location: line.location,
				...header.value,
				metadata: body.metadata,
				postings,
			})),
		);
	}
	return batch(results);
};

type Body = { metadata: RupeeMetadata; postings: MetadataPosting[]; failed: RupeeError[] };

// Metadata belongs to the nearest line above it that is not metadata.
const readBody = (lines: RupeeLine[]): Body => {
	const own = readMetadata(takeWhile(lines, isMetadata));
	// `Array.from` maps as it drains, so each posting takes the metadata under it.
	const postings = Array.from(drain(lines), (l) => ({
		posting: parsePosting(l),
		metadata: readMetadata(takeWhile(lines, isMetadata)),
	}));

	return {
		metadata: own.metadata,
		postings: postings.flatMap(({ posting, metadata }) =>
			posting.isOk() ? [{ ...posting.value, metadata: metadata.metadata }] : [],
		),
		failed: [
			...own.failed,
			...postings.flatMap(({ posting, metadata }) => [
				...(posting.isErr() ? [posting.error] : []),
				...metadata.failed,
			]),
		],
	};
};

type ReadMetadata = { metadata: RupeeMetadata; failed: RupeeError[] };

const readMetadata = (lines: RupeeLine[]): ReadMetadata => {
	const entries = batch(lines.map(parseMetadata));
	return { metadata: toMetadata(entries.succeeded), failed: entries.failed };
};

const parseMetadata = ({ location, content }: RupeeLine): Result<[string, string]> => {
	const entry = /^\s*-\s+([^\s:]+):\s+(\S.*?)\s*$/.exec(content);
	return entry?.[1] && entry[2]
		? ok([entry[1], entry[2]])
		: err(fault('ParseInvalidMetadata', { location: displayLocation(location) }));
};

function* drain<T>(sk: T[]): Generator<T> {
	while (sk.length > 0) yield* sk.splice(0, 1);
}

const takeWhile = <T>(stack: T[], keep: (item: T) => boolean): T[] => {
	const end = stack.findIndex((i) => !keep(i));
	return stack.splice(0, end < 0 ? stack.length : end);
};

const isBlank = ({ content }: RupeeLine) => content.trim() === '';

const isComment = ({ content }: RupeeLine) => content.startsWith(';');

// Indentation means nothing to a metadata line; the dash does.
const isMetadata = ({ content }: RupeeLine) => /^\s*-(\s|$)/.test(content);

const isPosting = (l: RupeeLine) => /^(\t| {2})/.test(l.content) && !isBlank(l) && !isMetadata(l);

// Each commodity sums to zero once priced postings are weighed at their price.
// A posting without an amount takes what is left, if that is one commodity.
const balance = (
	location: RupeeParseLocation,
	written: MetadataPosting[],
): Result<RupeePosting[]> => {
	if (written.length < 2)
		return err(fault('ParseMissingTransactionBody', { location: displayLocation(location) }));
	const implicit = written.filter((p) => p.quantity === null);
	if (implicit.length > 1)
		return err(fault('ParseMultipleImplicitPostings', { location: displayLocation(location) }));

	const known = written.flatMap((p) =>
		p.quantity === null ? [] : [{ ...p, quantity: p.quantity }],
	);
	const left = residual(known.map((p) => weight(home(p))));
	if (implicit.length === 0 && left.length > 0) return unbalanced(location, left);
	if (left.length > 1) return unbalanced(location, left);

	const [rest = { amount: 0n as Amount, commodity: DEFAULT_COMMODITY }] = left;
	const postings = written.map(({ account, quantity, price, balance: b, metadata }) => {
		const filled =
			quantity === null
				? { amount: -rest.amount as Amount, commodity: rest.commodity }
				: { amount: quantity.amount, commodity: quantity.commodity ?? DEFAULT_COMMODITY };
		return { account, ...filled, price, balance: b, metadata };
	});
	if (
		postings.some((p) => p.balance !== null && (p.balance.commodity ?? p.commodity) !== p.commodity)
	)
		return err(fault('ParseInvalidPosting', { location: displayLocation(location) }));

	return ok(postings.map(({ balance: b, ...p }) => ({ ...p, balance: b?.amount ?? null })));
};

type KnownPosting = WrittenPosting & { quantity: WrittenQuantity };

const home = (p: KnownPosting) => ({
	amount: p.quantity.amount,
	commodity: p.quantity.commodity ?? DEFAULT_COMMODITY,
	price: p.price,
});

const residual = (weights: Quantity[]): Quantity[] =>
	Object.entries(Object.groupBy(weights, (w) => w.commodity))
		.map(([commodity, group = []]) => ({
			commodity,
			amount: group.reduce((t, w) => t + w.amount, 0n) as Amount,
		}))
		.filter((q) => q.amount !== 0n);

const unbalanced = (l: RupeeParseLocation, q: Quantity[]): Result<never> =>
	err(
		fault('ParseUnbalancedTransaction', {
			location: displayLocation(l),
			residual: q.map(formatQuantity).join(', '),
		}),
	);

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
		: err(fault('ParseInvalidTransactionHeader', { location: displayLocation(location) }));
};

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

export const parsePosting = (l: RupeeLine): Result<WrittenPosting> =>
	readPosting(l).andThen((p) => checkAccount(l.location, p));

const checkAccount = (
	location: RupeeParseLocation,
	posting: WrittenPosting,
): Result<WrittenPosting> => {
	if (accountType(posting.account)) return ok(posting);

	return err(
		fault('ParseInvalidAccount', {
			location: displayLocation(location),
			account: posting.account,
		}),
	);
};

// `Account amount [commodity] [@ price | @@ total] [= balance]`.
const readPosting = ({ location, content }: RupeeLine): Result<WrittenPosting> => {
	const invalid = err(fault('ParseInvalidPosting', { location: displayLocation(location) }));
	const parts = /^\s*([^\s=@]+)(?:\s+([^@=]*?))?\s*(?:(@@?)\s*([^=]*?))?\s*(?:=\s*(.*?))?\s*$/.exec(
		content,
	);
	if (!parts?.[1]) return invalid;

	const [, account, amount = '', priced, price = '', balance] = parts;
	const quantity = amount === '' ? null : readQuantity(amount);
	const cost = priced === undefined ? null : readQuantity(price);
	const asserted = balance === undefined ? null : readQuantity(balance);
	if (quantity === undefined || cost === undefined || asserted === undefined) return invalid;
	if (priced !== undefined && (quantity === null || cost === null || cost.amount < 0n))
		return invalid;

	return ok({
		account,
		quantity,
		price:
			cost === null
				? null
				: {
						amount: cost.amount,
						commodity: cost.commodity ?? DEFAULT_COMMODITY,
						kind: priced === '@@' ? PriceKind.Total : PriceKind.Unit,
					},
		balance: asserted,
	});
};

// An amount, and optionally its commodity after it; `undefined` if it is neither.
const readQuantity = (text: string): WrittenQuantity | undefined =>
	match(text.split(/\s+/).filter(Boolean))
		.with([P.string], [P.string, P.string.regex(COMMODITY)], ([amount, commodity]) => {
			const parsed = parseAmount(amount);
			return parsed === null
				? undefined
				: { amount: parsed, commodity: commodity?.toUpperCase() ?? null };
		})
		.otherwise(() => undefined);

const COMMODITY = /^[A-Za-z][A-Za-z0-9._-]*$/;

export const parseAmount = (text: string): Amount | null => {
	const cleaned = text.replaceAll(',', '').replaceAll('₹', '').trim();
	const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
	if (!match?.[2]) return null;
	const [, sign, whole, fraction = ''] = match;
	if (fraction.length > AMOUNT_SCALE) return null;
	const units = BigInt(whole + fraction.padEnd(AMOUNT_SCALE, '0'));
	return (sign === '-' ? -units : units) as Amount;
};

type ParseOptions = {
	format: string;
	text: string;
};

// Strict, so a list of formats never reads one text two ways.
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
	reference?: Date | undefined;
};

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

// date-fns fills fields a format leaves out with the 1st, January or 1970, so
// the sample date avoids all three.
export const isDateFormat = (format: string, reference?: Date): boolean =>
	parseDate({
		format,
		text: dateFns.format(new Date(2026, 7, 29), format),
		reference,
	})?.equals('2026-08-29') === true;

export const isTimeFormat = (format: string): boolean =>
	parseTime({
		format,
		text: dateFns.format(new Date(2026, 7, 29, 14, 30), format),
	})?.equals('14:30') === true;
