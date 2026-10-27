import { BALANCE_TYPES } from './taxonomy';
import type { AccountType } from './types';

/** An account, the one right above it, and whether any posting names it rather than one under it. */
export type AccountNode = {
	id: string;
	name: string;
	type: AccountType;
	parentId: string | null;
	posted: boolean;
};

/**
 * Each account's parent as charts and pickers divide accounts. An account with one account right
 * under it and nothing posted to it divides into nothing, so it is left out and the one under it
 * takes its place; top-level accounts always divide.
 */
export const parentsIn = (tree: AccountNode[]): Record<string, string | null> => {
	const byId = Object.fromEntries(tree.map((n) => [n.id, n]));
	const children = childrenIn(tree);
	const divides = (id: string | null): AccountNode | null => {
		const n = id === null ? undefined : byId[id];
		if (!n) return null;

		return isSkipped(n, children) ? divides(n.parentId) : n;
	};

	return Object.fromEntries(
		tree
			.filter((n) => !isSkipped(n, children))
			.map((n) => [n.name, divides(n.parentId)?.name ?? null]),
	);
};

/**
 * Which part of worth each balance account under one counts towards: an account it divides into,
 * or itself for what it holds directly. One that divides into nothing is divided by commodity, and
 * no account at all stands for every top balance account.
 */
export const partsIn = (tree: AccountNode[], account: string | null) => {
	const byId = Object.fromEntries(tree.map((n) => [n.id, n]));
	const parents = parentsIn(tree);
	const root = account === null ? null : standIn(tree, account);
	if (account !== null && root === null) return { parts: [], byCommodity: false };

	const isRoot = (n: AccountNode) => (root === null ? n.parentId === null : n.id === root.id);
	const lineOf = (n: AccountNode): AccountNode[] => {
		const up = n.parentId === null ? undefined : byId[n.parentId];
		return up ? [n, ...lineOf(up)] : [n];
	};
	const partOf = (n: AccountNode) => {
		const line = lineOf(n);
		const at = line.findIndex(isRoot);
		const top = line[at];
		if (!top) return null;

		return line.slice(0, at).find((m) => parents[m.name] === top.name)?.name ?? n.name;
	};

	const parts = tree
		.filter((n) => BALANCE_TYPES.includes(n.type))
		.flatMap((n) => {
			const part = partOf(n);
			return part === null ? [] : [{ accountId: n.id, part }];
		});

	return { parts, byCommodity: root !== null && parts.every((p) => p.part === root.name) };
};

/** The account named, whatever its case, or the first one under it that divides. */
const standIn = (tree: AccountNode[], account: string) => {
	const children = childrenIn(tree);
	const named = tree.find((n) => n.name.toLowerCase() === account.toLowerCase());
	const down = (n: AccountNode): AccountNode => {
		const only = children[n.id]?.[0];
		return only && isSkipped(n, children) ? down(only) : n;
	};

	return named ? down(named) : null;
};

const childrenIn = (t: AccountNode[]) => Object.groupBy(t, (n) => n.parentId ?? '');

/** An account in between, with nothing posted to it and only one account under it. */
const isSkipped = (n: AccountNode, c: Partial<Record<string, AccountNode[]>>) =>
	n.parentId !== null && !n.posted && c[n.id]?.length === 1;
