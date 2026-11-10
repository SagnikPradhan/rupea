import * as v from 'valibot';

export const AMOUNT_SCALE = 10;
export const AMOUNT_UNIT = 10n ** BigInt(AMOUNT_SCALE);

/**
 * Ten-billionths of a unit, so 1250.5 is 12_505_000_000_000n; only parseAmount
 * makes one.
 */
export type Amount = bigint & { readonly brand: unique symbol };

export const ZERO = 0n as Amount;

/**
 * The most whole digits an amount holds: the database column keeps 38 digits,
 * ten of them the fraction.
 */
const WHOLE_DIGITS = 28;

/** An optional sign, up to 28 whole digits and up to 10 decimals. */
const DECIMAL = new RegExp(
	String.raw`^([+-]?)(\d{1,${WHOLE_DIGITS}})(?:\.(\d{1,${AMOUNT_SCALE}}))?$`,
);

/**
 * Reads a decimal, ignoring commas and the rupee sign; null when it has more
 * digits than an Amount holds. The wire Amount accepts the same decimals.
 */
export const parseAmount = (text: string): Amount | null => {
	const cleaned = text.replaceAll(',', '').replaceAll('₹', '').trim();
	const match = DECIMAL.exec(cleaned);
	if (!match) return null;

	const [, sign, whole, fraction = ''] = match;

	const units = BigInt(whole + fraction.padEnd(AMOUNT_SCALE, '0'));
	return (sign === '-' ? -units : units) as Amount;
};

/** Writes an amount as an exact decimal, like -1250.50, keeping null. */
export function printAmount(amount: Amount): string;
export function printAmount(amount: Amount | null): string | null;
export function printAmount(amount: Amount | null) {
	if (amount === null) return null;

	const digits = (amount < 0n ? -amount : amount).toString().padStart(AMOUNT_SCALE + 1, '0');
	const whole = digits.slice(0, -AMOUNT_SCALE);
	const fraction = digits.slice(-AMOUNT_SCALE);
	const shown = fraction.slice(0, [...fraction].findLastIndex((d) => d !== '0') + 1);
	return `${amount < 0n ? '-' : ''}${whole}.${shown.padEnd(2, '0')}`;
}

/** Rounds half away from zero, back to the amount scale. */
export const multiply = (a: Amount, b: Amount): Amount => {
	const product = a * b;
	const half = (product < 0n ? -AMOUNT_UNIT : AMOUNT_UNIT) / 2n;
	return ((product + half) / AMOUNT_UNIT) as Amount;
};

/** Both are non-negative here; rounds half up, back to the amount scale. */
export const divide = (a: Amount, b: Amount): Amount =>
	((a * AMOUNT_UNIT * 2n + b) / (2n * b)) as Amount;

export const sum = (a: Amount[]): Amount => a.reduce((t, x) => t + x, 0n) as Amount;

export const min = (a: Amount, b: Amount): Amount => (a < b ? a : b);

/** An amount as a float, for drawing; digits past about fifteen are lost. */
export const toNumber = (a: Amount) => Number(printAmount(a));

/** Orders amounts smallest first, for sorting. */
export const byAmount = (a: Amount, b: Amount) => Number(a - b);

const DESCRIPTION = 'An amount in rupees or units, as a decimal string with up to 10 decimals.';

/**
 * An amount as a decimal string like `-1250.50`, which loses nothing and which
 * JSON carries where a bigint cannot go.
 */
export const Amount = v.pipe(
	v.string(),
	v.regex(DECIMAL),
	v.transform((t) => parseAmount(t) as Amount),
	v.description(DESCRIPTION),
);

/** An Amount going out, written the way Amount reads it back. */
export const AmountOut = v.pipe(
	v.custom<Amount>((a) => typeof a === 'bigint'),
	v.transform((a) => printAmount(a)),
	v.string(),
	v.regex(DECIMAL),
	v.description(DESCRIPTION),
);

/** An amount of a commodity going out. */
export const QuantityOut = v.object({ amount: AmountOut, commodity: v.string() });
