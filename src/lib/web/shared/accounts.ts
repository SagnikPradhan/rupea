/** How many parents an account has, so Expenses is 0 and Expenses:Food is 1. */
export const depthOf = (a: string) => a.split(':').length - 1;

/** Whether an account is another or under it, ignoring case as the server does; every account is under none. */
export const isUnder = (a: string, b: string | null) =>
	b === null || same(a, b) || a.toLowerCase().startsWith(`${b.toLowerCase()}:`);

export const nameOf = (a: string) => a.split(':').at(-1) ?? a;

/** The first letter of each parent, like A:C: for Assets:Checking:HDFC. */
export const prefixOf = (account: string) =>
	account
		.split(':')
		.slice(0, -1)
		.map((p) => `${p[0]}:`)
		.join('');

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
