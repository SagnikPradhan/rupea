import { ASSETS } from '#lib/shared/accounts.ts';
import { nameOf } from './accounts';

type Held = { account: string; parent: string | null; total: string };

/** An arc of one ring, from and to as fractions of the circle; own is false for the rest of an account its sub-accounts leave, and for an arc carried outward past the last of its sub-accounts. */
export type Arc = {
	key: string;
	label: string;
	level: number;
	part: number;
	from: number;
	to: number;
	value: number;
	share: number;
	own: boolean;
};

type Slice = { held: Held; value: number; own: boolean };

const sum = (n: number[]) => n.reduce((t, x) => t + x, 0);

/**
 * Divides what an account holds into rings, one per level of accounts under it: each account's arc
 * is as wide as what it and those under it hold, and its sub-accounts divide it in the ring
 * outside. What an account holds beyond its sub-accounts, and an account with none, carries on as
 * an arc of its own name out to the last ring. An account that holds nothing, or owes, has no arc;
 * skipped counts the accounts that owe.
 */
export const ringsOf = (accounts: Held[], root: string = ASSETS) => {
	const top = accounts.find((a) => a.account.toLowerCase() === root.toLowerCase());
	if (!top) return { arcs: [], levels: 0, skipped: 0 };

	const byParent = Object.groupBy(accounts, (a) => a.parent ?? '');
	const kids = (a: Held) => byParent[a.account] ?? [];
	const totalOf = (a: Held) => Number(a.total);
	const restOf = (a: Held) => Math.max(0, totalOf(a) - sum(kids(a).map(totalOf)));
	const drawn = (a: Held): number => sum(kids(a).map(drawn)) + restOf(a);
	const levelsUnder = (a: Held): number => {
		const live = kids(a).filter((k) => drawn(k) > 0);
		return live.length === 0 ? 1 : 1 + Math.max(...live.map(levelsUnder));
	};
	const under = ({ held, own }: Slice): Slice[] =>
		own
			? [
					...kids(held)
						.filter((k) => drawn(k) > 0)
						.map((k) => ({ held: k, value: drawn(k), own: true })),
					...(restOf(held) > 0 ? [{ held, value: restOf(held), own: false }] : []),
				].toSorted((a, b) => b.value - a.value)
			: [{ held, value: restOf(held), own: false }];

	const grand = drawn(top);
	const levels = levelsUnder(top) - 1;
	const arcs: Arc[] = [];

	const place = (
		slices: Slice[],
		at: { level: number; from: number; span: number; part: number | null },
	) => {
		const total = sum(slices.map((s) => s.value));

		const cursor = { start: at.from };

		slices.forEach((s, i) => {
			const start = cursor.start;
			const width = (at.span * s.value) / total;
			const part = at.part ?? i;
			arcs.push({
				key: s.held.account,
				label: nameOf(s.held.account),
				level: at.level,
				part,
				from: start,
				to: start + width,
				value: s.value,
				share: s.value / grand,
				own: s.own,
			});
			if (at.level < levels)
				place(under(s), { level: at.level + 1, from: start, span: width, part });

			cursor.start = start + width;
		});
	};

	if (grand > 0 && levels > 0)
		place(under({ held: top, value: grand, own: true }), {
			level: 1,
			from: 0,
			span: 1,
			part: null,
		});

	return {
		arcs,
		levels,
		skipped: accounts.filter(
			(a) =>
				a !== top &&
				totalOf(a) < 0 &&
				a.account.toLowerCase().startsWith(`${top.account.toLowerCase()}:`),
		).length,
	};
};
