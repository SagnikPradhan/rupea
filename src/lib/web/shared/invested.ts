import { ASSETS } from '#lib/shared/accounts.ts';
import { depthOf, isUnder, nameOf } from './accounts';

type Held = { account: string; cost: string | null; gain: string | null };

type Returned = { netIn: string; xirr: number | null };

type Grown = { value: number; cost: number; gain: number; netIn: number; xirr: number | null };

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
			value: Number(a.cost) + Number(a.gain ?? 0),
			cost: Number(a.cost),
			gain: Number(a.gain ?? 0),
			netIn: Number(returns[a.account]?.netIn ?? 0),
			xirr: returns[a.account]?.xirr ?? null,
		}))
		.toSorted((a, b) => b.value - a.value);

/**
 * The groups directly under Assets among them, so a group and its accounts are
 * not counted twice.
 */
export const groupsInvested = <Invested extends { account: string }>(i: Invested[]) =>
	i.filter((a) => depthOf(a.account) === 1);

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
