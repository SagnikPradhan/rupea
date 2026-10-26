/** How many parents an account has, so Expenses is 0 and Expenses:Food is 1. */
export const depthOf = (a: string) => a.split(':').length - 1;

/** Whether an account is another or under it, ignoring case as the server does; every account is under none. */
export const isUnder = (a: string, b: string | null) =>
	b === null || same(a, b) || a.toLowerCase().startsWith(`${b.toLowerCase()}:`);

/** Whether an account is one level under another, ignoring case. */
export const isChildOf = (a: string, b: string) => isUnder(a, b) && depthOf(a) === depthOf(b) + 1;

/** The accounts one level under another, or the top ones under none, each named as first written. */
export const childrenOf = (accounts: string[], parent: string | null) => {
	const levels = parent === null ? 1 : parent.split(':').length + 1;
	const named = accounts
		.filter((a) => isUnder(a, parent) && a.split(':').length >= levels)
		.map((a) => a.split(':').slice(0, levels).join(':'));

	return named.filter((n, i) => named.findIndex((m) => same(m, n)) === i);
};

export const nameOf = (a: string) => a.split(':').at(-1) ?? a;

/** The first letter of each parent, like A:C: for Assets:Checking:HDFC. */
export const prefixOf = (account: string) =>
	account
		.split(':')
		.slice(0, -1)
		.map((p) => `${p[0]}:`)
		.join('');

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
