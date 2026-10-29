import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { parseTime } from '#lib/server/shared/dates.ts';
import * as dateFns from 'date-fns';
import { formatQuantity } from './amounts';
import { match } from 'ts-pattern';
import {
	NodeKind,
	PriceKind,
	type LotCost,
	type Price,
	type RupeaEntries,
	type RupeaEntryNode,
	type RupeaFileNode,
	type RupeaLink,
	type RupeaMarketPrice,
	type RupeaPosting,
	type RupeaPostingNode,
	type RupeaTransactionNode,
} from './types';

export const PRICE_SIGN: Record<PriceKind, string> = {
	[PriceKind.Unit]: '@',
	[PriceKind.Total]: '@@',
};

/** One blank line between entries, except between P lines; amounts aligned across the file. */
export const print = (c: LedgerConfiguration, file: RupeaFileNode): string => {
	const column = columnOf(file);
	const top = printMetadata('', file.metadata) + printComments('', file.comments);
	const blocks = blocksOf(file.children).map((b) =>
		b.map((e) => printEntry(c, column, e)).join(''),
	);

	return [top, ...blocks].filter(Boolean).join('\n');
};

const printEntry = (c: LedgerConfiguration, column: number, e: RupeaEntryNode): string =>
	match(e)
		.with({ kind: NodeKind.Transaction }, (t) => printTransaction(c, column, t))
		.with({ kind: NodeKind.Price }, (p) => printPrice(c, p) + printComments('', p.comments))
		.with({ kind: NodeKind.Link }, (l) => printLink(c, l) + printComments('', l.comments))
		.with({ kind: NodeKind.Note }, (n) => printComments('', n.comments))
		.with({ kind: NodeKind.Failed }, (f) => printLines(f.lines) + printComments('', f.comments))
		.exhaustive();

const printTransaction = (
	{ dateFormats, timeFormats }: LedgerConfiguration,
	column: number,
	t: RupeaTransactionNode,
): string => {
	const header = [
		printDate(dateFormats[0], t.date),
		...(t.time ? [printTime(timeFormats, t.time)] : []),
		t.description,
	].join(' ');

	return [
		`${header}\n`,
		printComments('\t', t.comments),
		printMetadata('\t', t.metadata),
		...t.children.map((p) => printPosting(dateFormats[0], column, p)),
	].join('');
};

// Posting metadata sits a level deeper only for the reader; the parser ignores indentation.
const printPosting = (f: string | undefined, column: number, p: RupeaPostingNode): string => {
	const terms = [
		...(p.elided ? [] : [formatQuantity(p)]),
		...printTerms(f, p),
		...(p.balance === null
			? []
			: ['=', formatQuantity({ amount: p.balance, commodity: p.commodity })]),
	].join(' ');
	const line = terms === '' ? p.account : `${p.account.padEnd(column)}${terms}`;

	return `\t${line}\n${printComments('\t\t', p.comments)}${printMetadata('\t\t', p.metadata)}`;
};

/** P lines in a row print as one block, as a file of prices is written. */
const blocksOf = (entries: RupeaEntryNode[]): RupeaEntryNode[][] => {
	const blocks: RupeaEntryNode[][] = [];

	for (const e of entries) {
		const last = blocks.at(-1);
		const joins = last !== undefined && isPLine(e) && isPLine(last.at(-1)!);
		if (joins) last.push(e);
		if (!joins) blocks.push([e]);
	}
	return blocks;
};

const isPLine = (e: RupeaEntryNode) => e.kind === NodeKind.Price || e.kind === NodeKind.Link;

/** Two spaces past the longest account, so the amounts line up. */
const columnOf = (file: RupeaFileNode) =>
	Math.max(
		0,
		...file.children.flatMap((e) =>
			e.kind === NodeKind.Transaction ? e.children.map((p) => p.account.length) : [],
		),
	) + 2;

const printTerms = (
	f: string | undefined,
	p: { price: Price | null; cost: LotCost | null },
): string[] => [
	...(p.cost === null ? [] : [printCost(f, p.cost)]),
	...(p.price === null ? [] : [PRICE_SIGN[p.price.kind], formatQuantity(p.price)]),
];

const printCost = (f: string | undefined, c: LotCost): string =>
	`{${[formatQuantity(c), ...(c.date ? [printDate(f, c.date)] : [])].join(', ')}}`;

const printPrice = ({ dateFormats }: LedgerConfiguration, p: RupeaMarketPrice): string =>
	`P ${printDate(dateFormats[0], p.date)} ${p.commodity} ${formatQuantity(p.price)}\n`;

const printLink = ({ dateFormats }: LedgerConfiguration, l: RupeaLink): string =>
	`P ${l.since ? printDate(dateFormats[0], l.since) : '*'} ${l.commodity} ${l.feed}:${l.symbol}\n`;

const printMetadata = (t: string, m: RupeaEntries): string =>
	m.map(([key, value]) => `${t}- ${key}: ${value}\n`).join('');

/** A comment that starts with another semicolon keeps it close, as in ;; heading. */
const printComments = (t: string, c: string[]): string =>
	c.map((x) => (x === '' || x.startsWith(';') ? `${t};${x}\n` : `${t}; ${x}\n`)).join('');

const printLines = (l: string[]): string => l.map((t) => `${t}\n`).join('');

const printDate = (f: string | undefined, d: Temporal.PlainDate) =>
	f ? dateFns.format(new Date(d.year, d.month - 1, d.day), f) : d.toString();

/** The first format that holds the time, so seconds are never dropped. */
const printTime = (formats: string[], t: Temporal.PlainTime) => {
	const date = new Date(1970, 0, 1, t.hour, t.minute, t.second);
	const written = formats
		.map((f) => ({ format: f, text: dateFns.format(date, f) }))
		.find((w) => parseTime(w)?.equals(t));

	return written?.text ?? t.toString();
};

/** A posting's amount with its cost and price, as the page shows it. */
export const printQuantity = (p: RupeaPosting): string =>
	[formatQuantity(p), ...printTerms(undefined, p)].join(' ');
