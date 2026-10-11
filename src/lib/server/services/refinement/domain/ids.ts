import { petName, type Pick } from '#lib/server/shared/names.ts';

// Words a bank puts around the merchant's name; shorter ones are skipped anyway.
const NOISE = new Set([
	'ach',
	'and',
	'atm',
	'bank',
	'card',
	'debit',
	'credit',
	'for',
	'from',
	'imps',
	'inb',
	'india',
	'ltd',
	'nach',
	'neft',
	'payment',
	'pos',
	'pvt',
	'ref',
	'rtgs',
	'the',
	'transfer',
	'txn',
	'upi',
]);

type EventIdOptions = {
	date: string;
	description: string;
	pick: Pick;
};

// `2026-10-01-amazon-brave-otter`, or `2026-10-01-brave-otter` when no word in
// the description names the merchant. Two words, since nothing checks a name
// again once suggested.
export const eventId = (options: EventIdOptions): string => {
	const merchant = options.description
		.toLowerCase()
		.split(/[^a-z]+/)
		.find((w) => w.length >= 3 && !NOISE.has(w));

	return [options.date, ...(merchant ? [merchant] : []), petName(options.pick)].join('-');
};
