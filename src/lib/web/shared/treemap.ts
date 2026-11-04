import { nameOf } from './accounts';
import { sumOf } from './numbers';

/** An account, or a holding of one, and what it is worth. */
type Tile = { key: string; label: string; amount: number; tiles: Tile[] };

type Account = {
	account: string;
	/** The account the server draws it under. */
	parent: string | null;
	total: string;
	holdings: { commodity: string; value: string | null }[];
};

/** An account as a tree of the accounts under it, down to their holdings, counted the way its total runs so owing is drawn too; unpriced holdings have no size. */
export const tileOf = (rows: Account[], account: string): Tile => {
	const sign = Math.sign(Number(rows.find((r) => r.account === account)?.total ?? 0));
	return grown(rows, account, sign);
};

/** An account's tiles are the accounts under it, or else its holdings when it has several; refunds and owing the other way have no size. */
const grown = (rows: Account[], account: string, sign: number): Tile => {
	const under = rows.filter((r) => r.parent === account);
	const holdings = (rows.find((r) => r.account === account)?.holdings ?? []).map((h) => ({
		key: `${account} ${h.commodity}`,
		label: h.commodity,
		amount: Number(h.value ?? 0) * sign,
		tiles: [],
	}));
	const own = holdings.length > 1 ? holdings : [];
	const tiles = (under.length > 0 ? under.map((r) => grown(rows, r.account, sign)) : own)
		.filter((t) => t.amount > 0)
		.toSorted((a, b) => b.amount - a.amount);

	return {
		key: account,
		label: nameOf(account),
		amount: sumOf((tiles.length > 0 ? tiles : holdings).map((t) => t.amount)),
		tiles,
	};
};
