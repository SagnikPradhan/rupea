const SIDES = new Set(['Assets', 'Liabilities']);

/** The account, first category and number of further categories a transaction's list row shows. */
export const rowOf = (postings: { account: string; quantity: string }[]) => {
	const side = postings.find((p) => SIDES.has(p.account.split(':')[0] ?? '')) ?? postings[0];
	const others = postings.filter((p) => p !== side);

	return { side, category: others[0] ?? null, more: Math.max(others.length - 1, 0) };
};
