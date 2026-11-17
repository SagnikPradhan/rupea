type Tree<Leaf> =
	| { kind: 'all'; of: Tree<Leaf>[] }
	| { kind: 'any'; of: Tree<Leaf>[] }
	| { kind: 'not'; of: Tree<Leaf> }
	| Leaf;

type Account = { kind: 'account'; name: string };

/** A test on one account: it is the named account or one under it, in any case. */
export type Test = Tree<Account>;

/**
 * A test on a posting, as plain data a query language can be compiled to. A
 * counter holds when the transaction has a posting on another account that
 * passes the test.
 */
export type Filter = Tree<Account | { kind: 'counter'; test: Test }>;

/** The filter every posting passes. */
export const EVERYTHING: Filter = { kind: 'all', of: [] };

/** Whether the filter is the one every posting passes. */
export const isEverything = (f: Filter) => f.kind === 'all' && f.of.length === 0;

/** Whether any posting needs the others of its transaction to pass. */
export const hasCounter = (filter: Filter): boolean => {
	if (filter.kind === 'counter') return true;
	if (filter.kind === 'account') return false;
	if (filter.kind === 'not') return hasCounter(filter.of);

	return filter.of.some(hasCounter);
};
