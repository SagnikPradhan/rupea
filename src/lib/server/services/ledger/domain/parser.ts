import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { parseDate, parseTime, type ReadOptions } from '#lib/server/shared/dates.ts';
import { batch, type Batch } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { drain, takeWhile } from '#lib/server/shared/arrays.ts';
import { match, P } from 'ts-pattern';
import {
	DEFAULT_COMMODITY,
	formatQuantity,
	multiply,
	parseAmount,
	sum,
	type Amount,
	type Quantity,
} from './amounts';
import { movesInKind } from './lots';
import { accountType } from './taxonomy';
import {
	Feed,
	PriceKind,
	type LotCost,
	type Price,
	type RupeeFile,
	type RupeeLink,
	type RupeeMarketPrice,
	type RupeeMetadata,
	type RupeeParseLocation,
	type RupeePosting,
	type RupeeTransaction,
} from './types';

const COMMODITY = /^[A-Za-z][A-Za-z0-9._-]*$/;
const LINK = /\s(?<feed>[A-Za-z]+):(?<symbol>\S+)\s*$/;

/** The feeds a link can name; a ledger's own symbols are priced by its files, never linked. */
const LINKED: Record<string, Feed> = { mfapi: Feed.Mfapi, yahoo: Feed.Yahoo };

/** A cost or price only follows an amount, and a price never starts with a minus. */
const POSTING =
	/^\s*(?<account>[^\s=@{]+)(?:\s+(?<amount>[^\s@={][^@={]*?)\s*(?:\{(?<lot>[^}]*)\})?\s*(?:(?<priced>@@?)(?![\s₹,]*-)\s*(?<price>[^=@]*?))?)?\s*(?:=\s*(?<balance>.*?))?\s*$/;

export const displayLocation = ({ file, line }: RupeeParseLocation): string => `${file}:${line}`;

type RupeeParsedFile = Batch<RupeeTransaction> & {
	metadata: RupeeMetadata;
	prices: RupeeMarketPrice[];
	links: RupeeLink[];
};

/** Metadata above the first transaction belongs to the file. */
export const parse = (
	c: LedgerConfiguration,
	{ key, content }: Pick<RupeeFile, 'key' | 'content'>,
): RupeeParsedFile => {
	const input = lines(key, content).filter((l) => !isComment(l));
	const preamble = readMetadata(
		takeWhile(input, (l) => isBlank(l) || isMetadata(l)).filter(isMetadata),
	);
	const prices = batch(input.filter(isPriceLine).map((l) => parsePriceLine(c, l)));
	const links = batch(input.filter(isLinkLine).map((l) => parseLinkLine(c, l)));
	const parsed = parseTransactions(c, input);

	return {
		metadata: preamble.metadata,
		prices: prices.succeeded,
		links: links.succeeded,
		succeeded: parsed.succeeded,
		failed: [...preamble.failed, ...prices.failed, ...links.failed, ...parsed.failed],
	};
};

export const toMetadata = (entries: [string, string][]): RupeeMetadata =>
	Object.fromEntries(
		Object.entries(Object.groupBy(entries, ([key]) => key)).map(([key, group = []]) => [
			key,
			group.map(([, value]) => value),
		]),
	);

export type RupeeLine = { location: RupeeParseLocation; content: string };

export const lines = (file: string, content: string): RupeeLine[] =>
	content
		.split('\n')
		.slice(0, content.endsWith('\n') ? -1 : undefined)
		.map((text, index) => ({
			location: { file, line: index + 1 },
			content: text,
		}));

/** A bad line drops its transaction; a bad header ends the parse, as the next one can't be found. */
const parseTransactions = (
	configuration: LedgerConfiguration,
	input: RupeeLine[],
): Batch<RupeeTransaction> => {
	const lines = input.filter((l) => !isComment(l));
	const results: Result<RupeeTransaction>[] = [];

	for (const line of drain(lines)) {
		if (isBlank(line) || isPLine(line)) continue;
		if (isMetadata(line)) {
			results.push(
				err(fault('ParseDetachedMetadata', { location: displayLocation(line.location) })),
			);
			continue;
		}

		const header = parseHeader(configuration, line);
		if (header.isErr()) return batch([...results, err(header.error)]);

		const body = readBody(
			configuration,
			takeWhile(lines, (l) => isPosting(l) || isMetadata(l)),
		);
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

type MetadataPosting = WrittenPosting & { metadata: RupeeMetadata };

type Body = { metadata: RupeeMetadata; postings: MetadataPosting[]; failed: RupeeError[] };

/** Metadata belongs to the nearest line above it that is not metadata. */
const readBody = (c: LedgerConfiguration, lines: RupeeLine[]): Body => {
	const own = readMetadata(takeWhile(lines, isMetadata));
	// Array.from maps as it drains, so each posting takes the metadata under it.
	const postings = Array.from(drain(lines), (l) => ({
		posting: readPosting(c, l).andThen((p) => checkAccount(l.location, p)),
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

export const isBlank = ({ content }: RupeeLine) => content.trim() === '';

export const isComment = ({ content }: RupeeLine) => content.startsWith(';');

/** Indentation means nothing to a metadata line; the dash does. */
export const isMetadata = ({ content }: RupeeLine) => /^\s*-(\s|$)/.test(content);

export const isPosting = (l: RupeeLine) =>
	/^(\t| {2})/.test(l.content) && !isBlank(l) && !isMetadata(l);

/** A P line prices a commodity, or links it to a feed when it ends in feed:symbol. */
const isPLine = ({ content }: RupeeLine) => /^P\s/.test(content);
const isLinkLine = (l: RupeeLine) => isPLine(l) && LINK.test(l.content);
const isPriceLine = (l: RupeeLine) => isPLine(l) && !LINK.test(l.content);

/** Each commodity nets to zero by weight; a posting without an amount takes what is left. */
const balance = (
	location: RupeeParseLocation,
	written: MetadataPosting[],
): Result<RupeePosting[]> => {
	const at = { location: displayLocation(location) };
	if (written.length < 2) return err(fault('ParseMissingTransactionBody', at));

	const [implicit, ...others] = written.filter((p) => p.quantity === null);
	if (others.length > 0) return err(fault('ParseMultipleImplicitPostings', at));

	const explicit = written.flatMap(({ quantity, ...p }) =>
		quantity ? [{ ...p, ...quantity }] : [],
	);
	const weights = explicit.map((p) => weight(p, explicit));
	const leftover = Object.entries(Object.groupBy(weights, (w) => w.commodity))
		.map(([commodity, group = []]) => ({ commodity, amount: sum(group.map((w) => w.amount)) }))
		.filter((q) => q.amount !== 0n);
	const residual = leftover.map(formatQuantity).join(', ');
	const balanced = leftover.length === 0 || (implicit && leftover.length === 1);
	if (!balanced) return err(fault('ParseUnbalancedTransaction', { ...at, residual }));

	const left = leftover[0] ?? { amount: 0n as Amount, commodity: DEFAULT_COMMODITY };
	const implied = { ...left, amount: -left.amount as Amount };
	const asserted = implicit?.balance?.commodity;
	if (asserted && asserted !== implied.commodity) return err(fault('ParseInvalidPosting', at));

	return ok(
		written.map(({ quantity, balance: assertion, ...p }) => ({
			...p,
			...(quantity ?? implied),
			balance: assertion?.amount ?? null,
		})),
	);
};

type Weighed = { amount: Amount; commodity: string; price: Price | null; cost: LotCost | null };

/** Its lot cost, else its price, else itself; a lot cost moving in kind only picks lots. */
const weight = (p: Weighed, transaction: Weighed[]): Quantity => {
	const units = transaction.filter((t) => t.commodity === p.commodity).map((t) => t.amount);
	if (p.cost !== null && !movesInKind(units))
		return { amount: multiply(p.amount, p.cost.amount), commodity: p.cost.commodity };
	if (p.price === null) return { amount: p.amount, commodity: p.commodity };
	if (p.price.kind === PriceKind.Total)
		return {
			amount: (p.amount < 0n ? -p.price.amount : p.price.amount) as Amount,
			commodity: p.price.commodity,
		};

	return { amount: multiply(p.amount, p.price.amount), commodity: p.price.commodity };
};

const parseHeader = (
	{ dateFormats, timeFormats }: LedgerConfiguration,
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
	read: (options: ReadOptions) => T | null,
): { value: T; rest: string[] } | undefined =>
	formats
		.flatMap((format) => {
			const length = format.trim().split(/\s+/).length;
			const value = read({ format, text: words.slice(0, length).join(' ') });
			return value === null ? [] : [{ value, rest: words.slice(length) }];
		})
		.sort((a, b) => a.rest.length - b.rest.length)
		.at(0);

/** P date commodity price [commodity], as ledger writes it. */
const parsePriceLine = (
	{ dateFormats }: LedgerConfiguration,
	{ location, content }: RupeeLine,
): Result<RupeeMarketPrice> => {
	const date = readWords(dateFormats, content.trim().split(/\s+/).slice(1), parseDate);
	const [commodity = '', ...price] = date?.rest ?? [];
	const quantity = readQuantity(price.join(' '));
	if (!date || !COMMODITY.test(commodity) || !quantity || quantity.amount < 0n)
		return err(fault('ParseInvalidPrice', { location: displayLocation(location) }));

	return ok({
		location,
		date: date.value,
		commodity: commodity.toUpperCase(),
		price: withDefaultCommodity(quantity),
	});
};

/** P date|* commodity feed:symbol, where * links it from the start. */
const parseLinkLine = (
	{ dateFormats }: LedgerConfiguration,
	{ location, content }: RupeeLine,
): Result<RupeeLink> => {
	const { feed = '', symbol = '' } = LINK.exec(content)?.groups ?? {};
	const words = content.trim().split(/\s+/).slice(1, -1);
	const since =
		words[0] === '*'
			? { value: null, rest: words.slice(1) }
			: readWords(dateFormats, words, parseDate);
	const [commodity = '', ...extra] = since?.rest ?? [];
	if (!since || !COMMODITY.test(commodity) || extra.length > 0)
		return err(fault('ParseInvalidLink', { location: displayLocation(location) }));

	const linked = LINKED[feed.toLowerCase()];
	if (!linked) return err(fault('ParseUnknownFeed', { location: displayLocation(location), feed }));
	return ok({
		location,
		since: since.value,
		commodity: commodity.toUpperCase(),
		feed: linked,
		symbol,
	});
};

type WrittenPosting = {
	account: string;
	quantity: Quantity | null;
	price: Price | null;
	cost: LotCost | null;
	balance: WrittenQuantity | null;
};

/** Account [amount [commodity] [{lot cost}] [@ price | @@ total]] [= balance] */
const readPosting = (
	{ dateFormats }: LedgerConfiguration,
	{ location, content }: RupeeLine,
): Result<WrittenPosting> => {
	const invalid = err(fault('ParseInvalidPosting', { location: displayLocation(location) }));
	const { account, amount, lot, priced, price, balance } = POSTING.exec(content)?.groups ?? {};
	if (!account) return invalid;

	const units = readQuantity(amount);
	const cost = readLotCost(dateFormats, lot);
	const paid = readQuantity(price);
	const asserted = readQuantity(balance);
	if (units === undefined || cost === undefined || paid === undefined || asserted === undefined)
		return invalid;

	const quantity = units ? withDefaultCommodity(units) : null;
	const assertsOther =
		quantity !== null && (asserted?.commodity ?? quantity.commodity) !== quantity.commodity;
	if (assertsOther) return invalid;

	return ok({
		account,
		quantity,
		price: paid
			? {
					...withDefaultCommodity(paid),
					kind: priced === '@@' ? PriceKind.Total : PriceKind.Unit,
				}
			: null,
		cost,
		balance: asserted,
	});
};

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

/** cost [commodity][, date], the date in a configured format. */
const readLotCost = (formats: string[], text: string | undefined): LotCost | null | undefined => {
	if (text === undefined) return null;

	const [, written, day] = /^(.*?)(?:,\s+(.*))?$/.exec(text.trim()) ?? [];
	const cost = readQuantity(written);
	const date = readDate(formats, day);
	if (!cost || cost.amount < 0n || date === undefined) return undefined;

	return { ...withDefaultCommodity(cost), date };
};

const readDate = (
	formats: string[],
	text: string | undefined,
): Temporal.PlainDate | null | undefined => {
	if (text === undefined) return null;

	const date = readWords(formats, text.trim().split(/\s+/), parseDate);
	return date?.rest.length === 0 ? date.value : undefined;
};

/** A commodity left out means the home one for an amount, the posting's own for a balance. */
type WrittenQuantity = { amount: Amount; commodity: string | null };
/** An amount and optionally its commodity; null without text, undefined if it is neither. */
const readQuantity = (text: string | undefined): WrittenQuantity | null | undefined => {
	if (text === undefined) return null;

	return match(text.split(/\s+/).filter(Boolean))
		.with([P.string], [P.string, P.string.regex(COMMODITY)], ([amount, commodity]) => {
			const parsed = parseAmount(amount);
			return parsed === null
				? undefined
				: { amount: parsed, commodity: commodity?.toUpperCase() ?? null };
		})
		.otherwise(() => undefined);
};

const withDefaultCommodity = (q: WrittenQuantity): Quantity => ({
	amount: q.amount,
	commodity: q.commodity ?? DEFAULT_COMMODITY,
});
