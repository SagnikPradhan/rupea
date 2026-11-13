/** How many parents an account has, so Expenses is 0 and Expenses:Food is 1. */
export const depthOf = (a: string) => a.split(':').length - 1;

/**
 * Whether an account is another or under it, ignoring case as the server does;
 * every account is under none.
 */
export const isUnder = (a: string, b: string | null) =>
	b === null || same(a, b) || a.toLowerCase().startsWith(`${b.toLowerCase()}:`);

/**
 * Whether an account is one level below another, so Expenses:Food is directly
 * under Expenses.
 */
export const isDirectlyUnder = (a: string, t: string) =>
	isUnder(a, t) && depthOf(a) === depthOf(t) + 1;

export const nameOf = (a: string) => a.split(':').at(-1) ?? a;

/**
 * The first letter of each parent, like A:C: for Assets:Checking:HDFC, or every
 * parent whole when full.
 */
export const prefixOf = (account: string, full = false) =>
	account
		.split(':')
		.slice(0, -1)
		.map((p) => (full ? `${p}:` : `${p[0]}:`))
		.join('');

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
