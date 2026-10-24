/** How many parents an account has, so Expenses is 0 and Expenses:Food is 1. */
export const depthOf = (a: string) => a.split(':').length - 1;

export const nameOf = (a: string) => a.split(':').at(-1) ?? a;

/** The first letter of each parent, like A:C: for Assets:Checking:HDFC. */
export const prefixOf = (account: string) =>
	account
		.split(':')
		.slice(0, -1)
		.map((p) => `${p[0]}:`)
		.join('');
