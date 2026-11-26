import { dayNumberOf } from '#lib/server/shared/dates.ts';
import { sum, type Amount } from './amounts';
import type { Row } from './deltas';
import type { Filter } from './filters';
import type { Flow } from './returns';
import { accountType, INVESTMENT_INCOME, parentsOf } from './taxonomy';
import { AccountType } from './types';

/** The postings that have a posting on an earning account in their transaction. */
export const EARNING: Filter = {
	kind: 'counter',
	test: { kind: 'any', of: INVESTMENT_INCOME.map((n) => ({ kind: 'account', name: n })) },
};

type Moved = {
	transaction: string;
	position: number;
	account: string;
	date: string;
	amount: Amount | null;
	earned: boolean;
	held: boolean;
};

type FlowsOfOptions = { deltas: Row[]; earning: Row[]; base: string };

/**
 * What flowed into each account on each day, as the deltas of the Assets
 * accounts say, less each posting's share of the income its transaction's
 * earning postings made: the postings of the transactions that have any, each
 * alone, with their commodity. Oldest account and day first.
 */
export const flowsOf = ({ deltas, earning, base }: FlowsOfOptions): Flow[] => {
	const days = deltas.map((r) => ({
		account: r.account,
		day: dayNumberOf(r.bucket),
		amount: r.value ?? (0n as Amount),
		unpriced: r.unpriced,
	}));
	const moved = earning
		.map((r) => movedFrom(r, base))
		.filter((m) => m.earned || accountType(m.account) === AccountType.Assets);
	const shared = Object.values(Object.groupBy(moved, (m) => m.transaction)).flatMap((p) =>
		sharedIn(p ?? []),
	);
	const changes = shared.flatMap((m) =>
		parentsOf(m.account).map((account) => ({
			account,
			day: dayNumberOf(m.date),
			amount: ((m.shared ?? 0n) - (m.amount ?? 0n)) as Amount,
			unpriced: Number(m.shared === null) - Number(m.amount === null),
		})),
	);

	return merged([...days, ...changes]);
};

const movedFrom = (r: Row, base: string): Moved => ({
	transaction: r.transaction ?? '',
	position: r.position ?? 0,
	account: r.account,
	date: r.bucket,
	amount: r.unpriced > 0 ? null : (r.value ?? (0n as Amount)),
	earned: INVESTMENT_INCOME.some((n) => isUnder(r.account, n)),
	held: r.commodity !== null && r.commodity !== base,
});

const isUnder = (account: string, name: string) => {
	const a = account.toLowerCase();
	const n = name.toLowerCase();

	return a === n || a.startsWith(`${n}:`);
};

/**
 * One transaction's postings that are not earning, each less its share of the
 * income: what the earning postings are worth, negated, split equally between
 * the postings that hold something other than the base, or between all of them
 * when none does, with what does not divide going to the first. An unpriced
 * earning posting leaves the income unknown.
 */
const sharedIn = (postings: Moved[]) => {
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

			return { ...p, shared: p.amount === null || share === null ? null : p.amount - share };
		});
};

const merged = (flows: Flow[]): Flow[] => {
	const byAccount: Record<string, Record<number, Flow>> = {};

	for (const f of flows) {
		const days = (byAccount[f.account] ??= {});
		const day = (days[f.day] ??= { ...f, amount: 0n as Amount, unpriced: 0 });
		day.amount = (day.amount + f.amount) as Amount;
		day.unpriced += f.unpriced;
	}

	return Object.values(byAccount).flatMap((d) => Object.values(d));
};
