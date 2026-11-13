import { nameOf } from './accounts';
import type { Arc } from './rings';

type Grown = { account: string; value: number; xirr: number | null };

type Swing = { account: string; swing: number };

/**
 * An account as a dot: how much it swings across, how fast it grew up, and how
 * much it holds as its size.
 */
export type Dot = {
	key: string;
	label: string;
	across: number;
	up: number;
	size: number;
	part: number;
};

/**
 * The accounts that have both a return and a swing, each coloured as the group
 * it sits in is in the rings.
 */
export const dotsOf = (grown: Grown[], swings: Swing[], arcs: Arc[]): Dot[] => {
	const groups = arcs.filter((a) => a.level === 1);
	const swingOf = Object.fromEntries(swings.map((s) => [s.account, s.swing]));

	return grown.flatMap((a) => {
		const across = swingOf[a.account];
		if (across === undefined || a.xirr === null || a.value <= 0) return [];

		const name = a.account.toLowerCase();
		const group = groups.find((g) => {
			const key = g.key.toLowerCase();
			return name === key || name.startsWith(`${key}:`);
		});

		return [
			{
				key: a.account,
				label: nameOf(a.account),
				across,
				up: a.xirr,
				size: a.value,
				part: group?.part ?? 0,
			},
		];
	});
};
