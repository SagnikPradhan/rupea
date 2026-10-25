import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import * as dateFns from 'date-fns';
import { formatQuantity } from './amounts';
import {
	PriceKind,
	type LotCost,
	type RupeaLedgerFile,
	type RupeaLink,
	type RupeaMarketPrice,
	type RupeaMetadata,
	type RupeaPosting,
	type RupeaTransaction,
} from './types';

export const PRICE_SIGN: Record<PriceKind, string> = {
	[PriceKind.Unit]: '@',
	[PriceKind.Total]: '@@',
};

export const print = (c: LedgerConfiguration, file: RupeaLedgerFile): string => {
	const pLines = [
		...file.prices.map((p) => printPrice(c, p)),
		...file.links.map((l) => printLink(c, l)),
	];
	return [
		printMetadata('', file.metadata),
		...file.transactions.map((t) => printTransaction(c, t)),
		pLines.join(''),
	]
		.filter(Boolean)
		.join('\n');
};

// A single outgoing posting leaves its amount out; it is whatever balances.
// With prices or several commodities every amount is spelled out.
const printTransaction = (
	{ dateFormats, timeFormats }: LedgerConfiguration,
	{ date, time, description, metadata, postings }: RupeaTransaction,
): string => {
	const header = [
		printDate(dateFormats[0], date),
		...(time ? [printTime(timeFormats[0], time)] : []),
		description,
	].join(' ');

	const outgoing = postings.filter((p) => p.amount < 0n);
	const plain = postings.every(
		(p) => p.price === null && p.cost === null && p.commodity === postings[0]?.commodity,
	);
	const elided = plain && outgoing.length === 1 ? outgoing[0] : undefined;

	return [
		`${header}\n`,
		printMetadata('\t', metadata),
		...postings.map((p) => printPosting(dateFormats[0], p, p === elided)),
	].join('');
};

// Posting metadata sits a level deeper only for the reader; the parser ignores indentation.
const printPosting = (f: string | undefined, p: RupeaPosting, elided: boolean): string => {
	const line = [
		p.account,
		...(elided ? [] : [formatQuantity(p)]),
		...printTerms(f, p),
		...(p.balance === null
			? []
			: ['=', formatQuantity({ amount: p.balance, commodity: p.commodity })]),
	].join(' ');
	return `\t${line}\n${printMetadata('\t\t', p.metadata)}`;
};

const printTerms = (f: string | undefined, p: RupeaPosting): string[] => [
	...(p.cost === null ? [] : [printCost(f, p.cost)]),
	...(p.price === null ? [] : [PRICE_SIGN[p.price.kind], formatQuantity(p.price)]),
];

const printCost = (f: string | undefined, c: LotCost): string =>
	`{${[formatQuantity(c), ...(c.date ? [printDate(f, c.date)] : [])].join(', ')}}`;

const printPrice = ({ dateFormats }: LedgerConfiguration, p: RupeaMarketPrice): string =>
	`P ${printDate(dateFormats[0], p.date)} ${p.commodity} ${formatQuantity(p.price)}\n`;

const printLink = ({ dateFormats }: LedgerConfiguration, l: RupeaLink): string =>
	`P ${l.since ? printDate(dateFormats[0], l.since) : '*'} ${l.commodity} ${l.feed}:${l.symbol}\n`;

const printMetadata = (t: string, m: RupeaMetadata): string =>
	Object.entries(m)
		.flatMap(([key, values]) => values.map((v) => `${t}- ${key}: ${v}\n`))
		.join('');

const printDate = (f: string | undefined, d: Temporal.PlainDate) =>
	f ? dateFns.format(new Date(d.year, d.month - 1, d.day), f) : d.toString();

const printTime = (f: string | undefined, t: Temporal.PlainTime) =>
	f ? dateFns.format(new Date(1970, 0, 1, t.hour, t.minute, t.second), f) : t.toString();

/** A posting's amount with its cost and price, as the page shows it. */
export const printQuantity = (p: RupeaPosting): string =>
	[formatQuantity(p), ...printTerms(undefined, p)].join(' ');
