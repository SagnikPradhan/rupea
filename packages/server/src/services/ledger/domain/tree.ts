import {
	parentsIn as parentsDividing,
	partsIn as partsDividing,
	type AccountRow,
} from '@rupea/shared/account-tree.ts';
import { BALANCE_TYPES } from './taxonomy';
import type { AccountType } from './types';
import type { PartOf } from './worth';

/**
 * An account, the one right above it, and whether any posting names it rather
 * than one under it.
 */
export type AccountNode = {
	id: string;
	name: string;
	type: AccountType;
	parentId: string | null;
	posted: boolean;
};

/** The accounts as the API lists them, each with the name of the one above it. */
export const accountsIn = (tree: AccountNode[]): AccountRow[] => {
	const names = Object.fromEntries(tree.map((n) => [n.id, n.name]));

	return tree.map((n) => ({
		account: n.name,
		parent: n.parentId === null ? null : (names[n.parentId] ?? null),
		posted: n.posted,
	}));
};

/** Each account's parent as parentsIn divides them. */
export const parentsIn = (t: AccountNode[]): Record<string, string | null> =>
	parentsDividing(accountsIn(t));

/** This account and every account under it, whatever their case. */
export const idsIn = (tree: AccountNode[], account: string): string[] => {
	const name = account.toLowerCase();
	return tree
		.filter((n) => n.name.toLowerCase() === name || n.name.toLowerCase().startsWith(`${name}:`))
		.map((n) => n.id);
};

/** Which part of worth each balance account under one counts towards. */
export const partsIn = (tree: AccountNode[], account: string | null) => {
	const found = partsDividing(accountsIn(tree), account);
	const ids = Object.fromEntries(tree.map((n) => [n.name, n.id]));

	return {
		byCommodity: found.byCommodity,
		parts: found.parts.flatMap((p) => {
			const accountId = ids[p.account];
			return accountId === undefined ? [] : [{ accountId, part: p.part }];
		}),
	};
};

/** Each balance account among these ids as a part of its own. */
export const ownPartsIn = (t: AccountNode[], i: string[]): PartOf[] =>
	t
		.filter((n) => BALANCE_TYPES.includes(n.type) && i.includes(n.id))
		.map((n) => ({ accountId: n.id, part: n.name }));
