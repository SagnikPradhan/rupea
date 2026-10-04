export type RupeeFile = {
	key: string;
	size: number;
	modified: Date;
	/** Opaque storage version; pass it back to make an edit conditional. */
	version: string;
	content: string;
};

/** Amounts are exact to this many decimal places. */
export const AMOUNT_SCALE = 6;

/**
 * A money amount as an exact integer count of millionths (`1250.5` is
 * `1_250_500_000n`), never a float. Only `parseAmount` constructs one.
 */
export type Amount = bigint & { readonly brand: unique symbol };

/** Where something came from: source file key and 1-based line number. */
export type RupeeParseLocation = { file: string; line: number };

export type RupeePosting = {
	account: string;
	/** `null` when the posting balances the rest of the transaction. */
	amount: Amount | null;
};

export type RupeeTransaction = {
	/** The header line of the transaction. */
	location: RupeeParseLocation;
	date: Temporal.PlainDate;
	/** Wall-clock time, in no particular zone, if the header gives one. */
	time: Temporal.PlainTime | null;
	description: string;
	postings: RupeePosting[];
};

/** `1_250_500_000n` → `1250.50`: at least two decimals, no trailing zeros. */
export const formatAmount = (amount: Amount): string => {
	const digits = (amount < 0n ? -amount : amount).toString().padStart(AMOUNT_SCALE + 1, '0');
	const whole = digits.slice(0, -AMOUNT_SCALE);
	const fraction = digits.slice(-AMOUNT_SCALE).replace(/0+$/, '').padEnd(2, '0');
	return `${amount < 0n ? '-' : ''}${whole}.${fraction}`;
};
