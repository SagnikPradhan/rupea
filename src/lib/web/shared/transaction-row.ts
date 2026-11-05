const SIDES = new Set(['Assets', 'Liabilities']);

/** The account, category and amount a transaction's list row shows, from its postings. */
export const rowOf = (postings: { account: string; quantity: string }[]) => {
	const side = postings.find((p) => SIDES.has(p.account.split(':')[0] ?? '')) ?? postings[0];
	const other = postings.find((p) => p !== side);

	if (postings.length > 2) return { side, category: null, split: postings.length };
	return { side, category: other ?? null, split: 0 };
};
