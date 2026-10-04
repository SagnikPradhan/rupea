/**
 * Writes transactions as `.rupee` text, the inverse of `parse`: dates and
 * times in the first configured format, so the text reads back under the
 * same configuration, and a blank line between transactions.
 *
 * A transaction with a single outgoing (negative) posting leaves that
 * posting's amount out, as it is just what balances the rest; any other
 * transaction spells every amount.
 */
import * as dateFns from 'date-fns';
import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import { formatAmount, type RupeePosting, type RupeeTransaction } from './types';

export const print = (c: RupeeConfiguration, t: RupeeTransaction[]): string =>
	t.map((t) => printTransaction(c, t)).join('\n');

const printTransaction = (
	{ dateFormats, timeFormats }: RupeeConfiguration,
	{ date, time, description, postings }: RupeeTransaction,
): string => {
	const header = [
		printDate(dateFormats[0], date),
		...(time ? [printTime(timeFormats[0], time)] : []),
		description,
	].join(' ');
	const outgoing = postings.filter((p) => p.amount < 0n);
	const elided = outgoing.length === 1 ? outgoing[0] : undefined;
	return [header, ...postings.map((p) => printPosting(p, p === elided))]
		.map((l) => `${l}\n`)
		.join('');
};

const printPosting = ({ account, amount }: RupeePosting, e: boolean): string =>
	e ? `\t${account}` : `\t${account} ${formatAmount(amount)}`;

const printDate = (f: string | undefined, d: Temporal.PlainDate) =>
	f ? dateFns.format(new Date(d.year, d.month - 1, d.day), f) : d.toString();

const printTime = (f: string | undefined, t: Temporal.PlainTime) =>
	f ? dateFns.format(new Date(1970, 0, 1, t.hour, t.minute, t.second), f) : t.toString();
