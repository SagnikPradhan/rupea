import { sum, type Amount } from './amounts';
import { dayNumberOf, type Flow } from './returns';

/**
 * A posting valued in the base, as Postgres reads it: the postings of a
 * transaction with no earning posting come already added up by account and day,
 * with a null transaction. The rest come one by one.
 */
export type Moved = {
	transactionId: string | null;
	position: number;
	account: string;
	date: string;
	amount: Amount | null;
	unpriced: number;
	earned: boolean;
	held: boolean;
};

/**
 * What flowed into each account on each day: a posting's value less its share
 * of the income its transaction's earning postings made. Oldest account and day
 * first.
 */
export const flowsOf = (moved: Moved[]): Flow[] => {
	const added = moved.filter((m) => m.transactionId === null);
	const shared = Object.values(
		Object.groupBy(
			moved.filter((m) => m.transactionId !== null),
			(m) => m.transactionId ?? '',
		),
	).flatMap((p) => sharedIn(p ?? []));

	return merged([...added, ...shared]);
};

/**
 * One transaction's postings that are not earning, each less its share of the
 * income: what the earning postings are worth, negated, split equally between
 * the postings that hold something other than the base, or between all of them
 * when none does, with what does not divide going to the first. An unpriced
 * earning posting leaves the income unknown.
 */
const sharedIn = (postings: Moved[]): Moved[] => {
	const earning = postings.filter((p) => p.earned);
	const income = earning.some((p) => p.amount === null)
		? null
		: -sum(earning.map((p) => p.amount ?? (0n as Amount)));
	const anyHeld = postings.some((p) => !p.earned && p.held);
	const targets = postings
		.filter((p) => !p.earned && (p.held || !anyHeld))
		.toSorted((a, b) => a.position - b.position);

	const count = BigInt(Math.max(targets.length, 1));
	const each = income === null ? null : income / count;
	const rest = income === null || each === null ? null : income - each * count;
	const shareOf = (p: Moved) => {
		if (!targets.includes(p)) return 0n;
		if (each === null || rest === null) return null;

		return p === targets[0] ? each + rest : each;
	};

	return postings
		.filter((p) => !p.earned)
		.map((p) => {
			const share = shareOf(p);
			const amount = p.amount === null || share === null ? null : ((p.amount - share) as Amount);

			return { ...p, amount, unpriced: amount === null ? 1 : 0 };
		});
};

const merged = (moved: Moved[]): Flow[] => {
	const byDay: Record<string, Moved> = {};

	for (const m of moved) {
		const day = (byDay[`${m.account} ${m.date}`] ??= { ...m, amount: 0n as Amount, unpriced: 0 });
		day.amount = ((day.amount ?? 0n) + (m.amount ?? 0n)) as Amount;
		day.unpriced += m.unpriced;
	}

	return Object.keys(byDay)
		.toSorted((a, b) => a.localeCompare(b))
		.map((k) => byDay[k])
		.flatMap((m) =>
			m
				? [
						{
							account: m.account,
							day: dayNumberOf(m.date),
							amount: m.amount ?? (0n as Amount),
							unpriced: m.unpriced,
						},
					]
				: [],
		);
};
