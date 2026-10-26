const WORDS = /[^\p{L}\p{N}]+/u;

/** Words a bank writes around the payee, by what they are. Places stay, since they tell merchants apart. */
const FILLER: Record<string, string[]> = {
	rail: ['upi', 'neft', 'imps', 'rtgs', 'pos', 'ach', 'nach', 'ecs', 'inb', 'ib', 'billpay'],
	steps: ['to', 'by', 'transfer', 'cr', 'dr', 'debit', 'card', 'purchase', 'gross', 'via', 'pay'],
	ids: ['utr', 'no', 'oid', 'na', 'p2a', 'othpg', 'autopay', 'mandaterequest'],
	gateway: [
		'raz',
		'razorpay',
		'rsp',
		'payu',
		'ptm',
		'paytm',
		'pytm',
		'rz',
		'rzp',
		'gpay',
		'payvia',
	],
	processor: ['bharatpe', 'easebuzz', 'easeb', 'cashfree', 'ppsl'],
	bank: ['utib', 'yesb', 'icic', 'karb', 'sbin', 'hdfc', 'ubin', 'barb', 'bkid', 'fdrl', 'idib'],
	branch: ['unba', 'idfb', 'scbl', 'kkbk', 'airp'],
	handle: ['axl', 'ybl', 'ibl', 'apl', 'yapl', 'fbpe', 'okaxis', 'okicici', 'okhdfcbank', 'oksbi'],
	provider: ['axisbank', 'hdfcbank'],
	legal: ['limited', 'ltd', 'pvt', 'private', 'limite', 'limi', 'lim', 'inc', 'llp', 'co', 'pv'],
	web: ['https', 'http', 'www', 'com', 'in'],
};

const FILLERS = new Set(Object.values(FILLER).flat());

/** A UPI handle, an IFSC code, a masked card or account number, or a reference with letters and digits. */
const CODES = [/@/, /^[a-z]{4}0[a-z0-9]{6}$/, /x{3}/, /^(?=.*\d)(?=.*[a-z]).{6,}$/];

/** A letter left alone where a bank cut a name short. */
const STUB = /^\p{L}$/u;

/** The words of a bank's description that say who was paid, without the codes and filler around them. */
export const clean = (description: string): string =>
	description
		.toLowerCase()
		.replace(/\d{4,}/g, ' ')
		.split(/[^\p{L}\p{N}@.]+/u)
		.flatMap((t) => (t.includes('@') ? [t] : t.split('.')))
		.filter(namesPayee)
		.join(' ');

const namesPayee = (t: string) =>
	t !== '' && !STUB.test(t) && !FILLERS.has(t) && !CODES.some((c) => c.test(t));

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
