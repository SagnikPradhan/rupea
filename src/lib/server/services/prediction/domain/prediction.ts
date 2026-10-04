import type { Amount } from '#lib/server/services/ledger/domain/types.ts';

/** The roots every account sits under, as in `Expenses:Food`. */
type RupeeCategory = 'Assets' | 'Liabilities' | 'Income' | 'Expenses' | 'Equity';

/**
 * Guess the account on the other side of a statement line that moved
 * `amount` through one's own account. A stand-in for a real classifier:
 * money out is an expense and money in is income, both uncategorised.
 */
export const predictAccount = ({ amount }: { amount: Amount }): string => {
	const category: RupeeCategory = amount < 0n ? 'Expenses' : 'Income';
	return `${category}:Uncategorized`;
};
