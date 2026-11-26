import type { PostedOut } from '@rupea/shared/money.ts';

export const rowOf = (postings: { account: string; quantity: PostedOut }[]) => {
	const from = postings.find((p) => p.quantity.amount.startsWith('-')) ?? null;
	const to = postings.filter((p) => p !== from);
	const amount = from
		? { ...from.quantity, amount: from.quantity.amount.slice(1) }
		: (to[0]?.quantity ?? null);

	return { from, to: to[0] ?? null, more: Math.max(to.length - 1, 0), amount };
};
