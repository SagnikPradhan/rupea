export const AMOUNT_SCALE = 10;
export const AMOUNT_UNIT = 10n ** BigInt(AMOUNT_SCALE);

/** What a bare amount is in. */
export const DEFAULT_COMMODITY = 'INR';

/** Ten-billionths of a unit, so 1250.5 is 12_505_000_000_000n; only parseAmount makes one. */
export type Amount = bigint & { readonly brand: unique symbol };

export type Quantity = { amount: Amount; commodity: string };

export const parseAmount = (text: string): Amount | null => {
	const cleaned = text.replaceAll(',', '').replaceAll('₹', '').trim();
	const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
	if (!match?.[2]) return null;

	const [, sign, whole, fraction = ''] = match;
	if (fraction.length > AMOUNT_SCALE) return null;

	const units = BigInt(whole + fraction.padEnd(AMOUNT_SCALE, '0'));
	return (sign === '-' ? -units : units) as Amount;
};

export const formatAmount = (amount: Amount): string => {
	const digits = (amount < 0n ? -amount : amount).toString().padStart(AMOUNT_SCALE + 1, '0');
	const whole = digits.slice(0, -AMOUNT_SCALE);
	const fraction = digits.slice(-AMOUNT_SCALE);
	const shown = fraction.slice(0, [...fraction].findLastIndex((d) => d !== '0') + 1);
	return `${amount < 0n ? '-' : ''}${whole}.${shown.padEnd(2, '0')}`;
};

export const formatQuantity = ({ amount, commodity }: Quantity): string =>
	commodity === DEFAULT_COMMODITY ? formatAmount(amount) : `${formatAmount(amount)} ${commodity}`;

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
