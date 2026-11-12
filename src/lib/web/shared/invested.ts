import * as v from 'valibot';
import { ASSETS, BalanceAccount } from '#lib/shared/accounts.ts';
import { type Amount, ZERO, toNumber } from '#lib/shared/amounts.ts';
import { periodIn } from '#lib/shared/dates.ts';
import { depthOf, isDirectlyUnder, isUnder, nameOf } from './accounts';

type Held = { account: string; cost: Amount | null; gain: Amount | null };

type Returned = { netIn: string; xirr: number | null };

type Grown = { value: number; cost: number; gain: number; netIn: number; xirr: number | null };

/** The accounts page's URL query, whose period is the year of the day. */
export const BalanceQuery = (day: string) =>
	v.pipe(
		v.object({
			account: v.optional(v.string()),
			at: v.optional(v.string()),
			range: v.optional(v.string()),
			from: v.optional(v.string()),
			to: v.optional(v.string()),
		}),
		v.transform((fields) => ({
			account: v.parse(BalanceAccount, fields.account ?? null),
			period: periodIn(fields, { kind: 'year', at: day.slice(0, 4) }),
		})),
	);

/**
 * The accounts under Assets that have a cost, the largest first, with what
 * their costed holdings are worth, what went into them and how fast they grew.
 */
export const investedOf = (accounts: Held[], returns: Record<string, Returned | undefined>) =>
	accounts
		.filter((a) => a.cost !== null && depthOf(a.account) >= 1 && isUnder(a.account, ASSETS))
		.map((a) => ({
			account: a.account,
			name: nameOf(a.account),
			value: toNumber(((a.cost ?? ZERO) + (a.gain ?? ZERO)) as Amount),
			cost: toNumber(a.cost ?? ZERO),
			gain: toNumber(a.gain ?? ZERO),
			netIn: Number(returns[a.account]?.netIn ?? 0),
			xirr: returns[a.account]?.xirr ?? null,
		}))
		.toSorted((a, b) => b.value - a.value);

/**
 * The groups directly under Assets among them, so a group and its accounts are
 * not counted twice.
 */
export const groupsInvested = <Invested extends { account: string }>(i: Invested[]) =>
	i.filter((a) => isDirectlyUnder(a.account, ASSETS));

/**
 * What the groups are worth together, what went into them, what they gained,
 * and their returns weighted by what each is worth.
 */
export const totalsOf = (groups: Grown[]) => {
	const grown = groups.filter((g) => g.xirr !== null);
	const weight = grown.reduce((t, g) => t + g.value, 0);

	return {
		value: groups.reduce((t, g) => t + g.value, 0),
		cost: groups.reduce((t, g) => t + g.cost, 0),
		gain: groups.reduce((t, g) => t + g.gain, 0),
		netIn: groups.reduce((t, g) => t + g.netIn, 0),
		xirr: weight === 0 ? null : grown.reduce((t, g) => t + g.value * (g.xirr ?? 0), 0) / weight,
	};
};

/**
 * Each account followed by the accounts under it, siblings keeping the order
 * they came in.
 */
export const nestedOf = <Invested extends { account: string }>(i: Invested[]) => {
	const accounts = new Set(i.map((a) => a.account));
	const under = (p: string): Invested[] =>
		i.filter((a) => parentOf(a.account) === p).flatMap((a) => [a, ...under(a.account)]);

	return i
		.filter((a) => !accounts.has(parentOf(a.account)))
		.flatMap((a) => [a, ...under(a.account)]);
};

const parentOf = (a: string) => a.slice(0, a.lastIndexOf(':'));
