const WORDS = /[^\p{L}\p{N}]+/u;
const TOKENS = /[^\p{L}\p{N}@.]+/u;

/**
 * Words a bank writes around the payee: how the money moved, through whom,
 * and legal or web suffixes. Places stay, since they tell merchants apart.
 */
const FILLER = new Set([
	'upi',
	'neft',
	'imps',
	'rtgs',
	'pos',
	'ach',
	'nach',
	'ecs',
	'inb',
	'ib',
	'billpay',
	'autopay',
	'mandaterequest',
	'utr',
	'no',
	'oid',
	'na',
	'p2a',
	'othpg',
	'to',
	'by',
	'transfer',
	'via',
	'cr',
	'dr',
	'debit',
	'card',
	'purchase',
	'gross',
	'pay',
	'ptm',
	'paytm',
	'pytm',
	'gpay',
	'raz',
	'razorpay',
	'rz',
	'rzp',
	'rsp',
	'payu',
	'payvia',
	'bharatpe',
	'easebuzz',
	'easeb',
	'cashfree',
	'ppsl',
	'utib',
	'yesb',
	'icic',
	'karb',
	'sbin',
	'hdfc',
	'ubin',
	'barb',
	'bkid',
	'fdrl',
	'idib',
	'unba',
	'idfb',
	'scbl',
	'kkbk',
	'airp',
	'axisbank',
	'hdfcbank',
	'axl',
	'ybl',
	'ibl',
	'apl',
	'yapl',
	'fbpe',
	'okaxis',
	'okicici',
	'okhdfcbank',
	'oksbi',
	'limited',
	'ltd',
	'pvt',
	'private',
	'limite',
	'limi',
	'lim',
	'inc',
	'llp',
	'co',
	'pv',
	'https',
	'http',
	'www',
	'com',
	'in',
]);

/**
 * A UPI handle, an IFSC code, a masked card or account number, a reference
 * with letters and digits, or a name with a counter after it.
 */
const CODES = [
	/@/,
	/^[a-z]{4}0[a-z0-9]{6}$/,
	/x{3}/,
	/^(?=(?:.*\d){3})(?=.*[a-z]).{6,}$/,
	/^[a-z]{4,}\d+$/,
];

/** A letter left alone where a bank cut a name short. */
const STUB = /^\p{L}$/u;

/** How long a name must be to count when it is spelled inside a word, not as one. */
const SPELLED = 5;

/** The words of a bank's description that say who was paid, without the codes and filler around them. */
export const clean = (description: string): string =>
	description
		.toLowerCase()
		.replace(/\d{4,}/g, ' ')
		.split(TOKENS)
		.flatMap((t) => (t.includes('@') ? [t] : t.split('.')))
		.filter(namesPayee)
		.join(' ');

const namesPayee = (t: string) =>
	t !== '' && !STUB.test(t) && !FILLER.has(t) && !CODES.some((c) => c.test(t));

/** Whether cleaned words spell a name, as words of their own or, when it is long enough, inside one. */
export const spells = (words: string, name: string): boolean => {
	const compact = name.replaceAll(' ', '');
	const inside = compact.length >= SPELLED && words.replaceAll(' ', '').includes(compact);
	return ` ${words} `.includes(` ${name} `) || inside;
};

export const accountText = (account: string): string =>
	account
		.toLowerCase()
		.split(WORDS)
		.filter((w) => w !== '')
		.join(' ');

export type Unembedded = { id: string; description: string };
export type Filled = { id: string; vector: Float32Array | null };

/** The words of each distinct description, leaving out those with none. */
export const wordsOf = (d: string[]): string[] =>
	[...new Set(d.map(clean))].filter((t) => t !== '');

/** The vectors are those of the rows' words; a description with no words gets no vector, but counts as done all the same. */
export const filled = (rows: Unembedded[], vectors: Float32Array[]): Filled[] => {
	const found = lookup(wordsOf(rows.map((r) => r.description)), vectors);
	return rows.map((r) => ({ id: r.id, vector: found(clean(r.description)) }));
};

export const lookup = <T>(texts: string[], values: T[]) => {
	const valueOf: Record<string, T | undefined> = Object.fromEntries(
		texts.map((t, i) => [t, values[i]]),
	);
	return (t: string): T | null => valueOf[t] ?? null;
};
