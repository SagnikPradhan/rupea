/** An account, the one right above it, and whether anything is posted to it. */
export type AccountRow = { account: string; parent: string | null; posted: boolean };

/**
 * Each account's parent as charts and pickers divide accounts. An account with
 * one account right under it and nothing posted to it divides into nothing, so
 * it is left out and the one under it takes its place; top-level accounts
 * always divide.
 */
export const parentsIn = (rows: AccountRow[]): Record<string, string | null> => {
	const byName = Object.fromEntries(rows.map((r) => [r.account, r]));
	const children = Object.groupBy(rows, (r) => r.parent ?? '');
	const isSkipped = (r: AccountRow) =>
		r.parent !== null && !r.posted && children[r.account]?.length === 1;
	const divides = (name: string | null): AccountRow | null => {
		const r = name === null ? undefined : byName[name];
		if (!r) return null;

		return isSkipped(r) ? divides(r.parent) : r;
	};

	return Object.fromEntries(
		rows.filter((r) => !isSkipped(r)).map((r) => [r.account, divides(r.parent)?.account ?? null]),
	);
};

/** An account and the part of worth its balances count towards. */
export type PartRow = { account: string; part: string };

/**
 * Which part of worth each balance account under one counts towards: an account
 * it divides into, or itself for what it holds directly. One that divides into
 * nothing is divided by commodity, and no account at all stands for every top
 * balance account.
 */
export const partsIn = (rows: AccountRow[], account: string | null) => {
	const byName = Object.fromEntries(rows.map((r) => [r.account, r]));
	const parents = parentsIn(rows);
	const root = account === null ? null : standIn(rows, account);
	if (account !== null && root === null) return { parts: [] as PartRow[], byCommodity: false };

	const isRoot = (r: AccountRow) =>
		root === null ? r.parent === null : r.account === root.account;
	const lineOf = (r: AccountRow): AccountRow[] => {
		const up = r.parent === null ? undefined : byName[r.parent];
		return up ? [r, ...lineOf(up)] : [r];
	};
	const partOf = (r: AccountRow) => {
		const line = lineOf(r);
		const at = line.findIndex(isRoot);
		const top = line[at];
		if (!top) return null;

		return line.slice(0, at).find((m) => parents[m.account] === top.account)?.account ?? r.account;
	};

	const parts = rows
		.filter((r) => isBalance(r.account))
		.flatMap((r) => {
			const part = partOf(r);
			return part === null ? [] : [{ account: r.account, part }];
		});

	return { parts, byCommodity: root !== null && parts.every((p) => p.part === root.account) };
};

const isBalance = (a: string) => /^(assets|liabilities)(:|$)/i.test(a);

/** The account named, whatever its case, or the first one under it that divides. */
const standIn = (rows: AccountRow[], account: string) => {
	const children = Object.groupBy(rows, (r) => r.parent ?? '');
	const named = rows.find((r) => r.account.toLowerCase() === account.toLowerCase());
	const down = (r: AccountRow): AccountRow => {
		const only = children[r.account]?.[0];
		const skipped = r.parent !== null && !r.posted && children[r.account]?.length === 1;
		return only && skipped ? down(only) : r;
	};

	return named ? down(named) : null;
};
