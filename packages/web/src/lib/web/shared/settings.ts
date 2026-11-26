import { LIABILITIES } from '@rupea/shared/money.ts';
import type { Terms } from '@rupea/shared/forms.ts';
import { byCodeUnit } from '@rupea/shared/text.ts';
import type * as v from 'valibot';
import { isUnder } from './accounts';

type Listed = { account: string; parent: string | null };
type ListedTerms = {
	account: string;
	current: Record<string, string>;
	held: v.InferOutput<typeof Terms> | null;
};

/** A liability that takes payments, with its terms when it has any. */
export type Liability = { account: string; terms: ListedTerms | null };

/**
 * The liabilities that take payments, by the kind their terms set up. Terms
 * whose account has no postings yet are listed too.
 */
export const liabilitiesOf = (accounts: Listed[], terms: ListedTerms[]) => {
	const parents = new Set(accounts.map((a) => a.parent?.toLowerCase()));
	const termsOf = Object.fromEntries(terms.map((t) => [t.account.toLowerCase(), t]));

	const leaves = accounts
		.map((a) => a.account)
		.filter((a) => isLiability(a) && !parents.has(a.toLowerCase()));
	const known = new Set(leaves.map((a) => a.toLowerCase()));
	const unposted = terms
		.map((t) => t.account)
		.filter((a) => isLiability(a) && !known.has(a.toLowerCase()));

	const all: Liability[] = [...leaves, ...unposted]
		.toSorted(byCodeUnit)
		.map((a) => ({ account: a, terms: termsOf[a.toLowerCase()] ?? null }));
	return {
		cards: all.filter((l) => l.terms?.held?.kind === 'card'),
		loans: all.filter((l) => l.terms?.held?.kind === 'loan'),
		unset: all.filter((l) => !l.terms?.held),
	};
};

const isLiability = (a: string) => a.toLowerCase() !== 'liabilities' && isUnder(a, LIABILITIES);
