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

export const ADJECTIVES = [
	'amber',
	'bold',
	'brave',
	'brisk',
	'calm',
	'clever',
	'cosy',
	'eager',
	'fair',
	'gentle',
	'glad',
	'golden',
	'grand',
	'happy',
	'jolly',
	'keen',
	'kind',
	'lively',
	'lucky',
	'merry',
	'mighty',
	'neat',
	'noble',
	'proud',
	'quick',
	'quiet',
	'rapid',
	'shy',
	'silver',
	'sunny',
	'swift',
	'tidy',
	'witty',
	'wise',
];

export const ANIMALS = [
	'badger',
	'bear',
	'bison',
	'camel',
	'cobra',
	'crane',
	'deer',
	'dolphin',
	'eagle',
	'falcon',
	'fox',
	'gecko',
	'heron',
	'ibex',
	'koala',
	'langur',
	'leopard',
	'lion',
	'lynx',
	'macaw',
	'mongoose',
	'myna',
	'otter',
	'owl',
	'panda',
	'parrot',
	'peacock',
	'python',
	'rhino',
	'robin',
	'sparrow',
	'swan',
	'tiger',
	'turtle',
	'walrus',
	'yak',
	'zebra',
];

// Chooses one of the words it is given.
export type Pick = (words: string[]) => string;

type EventIdOptions = {
	date: string;
	description: string;
	pick: Pick;
};

// `2026-10-01-amazon-otter`, or `2026-10-01-brave-otter` when no word in the
// description names the merchant.
export const eventId = (options: EventIdOptions): string => {
	const merchant = options.description
		.toLowerCase()
		.split(/[^a-z]+/)
		.find((w) => w.length >= 3 && !NOISE.has(w));
	const first = merchant ?? options.pick(ADJECTIVES);

	return [options.date, first, options.pick(ANIMALS)].join('-');
};
