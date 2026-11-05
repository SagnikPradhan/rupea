/** Where a transaction's list row says the money left, where it went, and how much. */
export const rowOf = (postings: { account: string; quantity: string }[]) => {
	const from = postings.find((p) => p.quantity.startsWith('-')) ?? null;
	const to = postings.filter((p) => p !== from);
	const amount = from ? from.quantity.slice(1) : (to[0]?.quantity ?? null);

	return { from, to: to[0] ?? null, more: Math.max(to.length - 1, 0), amount };
};
