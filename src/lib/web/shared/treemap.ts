import { nameOf } from './accounts';
import { sumOf } from './numbers';

/** The space between two boxes, and around the boxes inside a group, in CSS pixels: --gap-related, so they line up with the group's name. */
const GAP = 16;
/** How tall a group's name is above the boxes inside it: a gap, a line of body text set solid, and a gap, --gap-block. */
const HEADER = 48;

/** An account, or a holding of one, and what it is worth. */
type Tile = { key: string; label: string; amount: number; tiles: Tile[] };

/** A tile placed in the chart, how deep under the root it lies, and whether it holds others. */
export type Box = {
	key: string;
	label: string;
	amount: number;
	depth: number;
	group: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
};

type Rect = { x: number; y: number; width: number; height: number };

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

/** Squarified tiles: each group's tiles packed as near square as they go, inside it under its name; an account with nothing under it is one box. */
export const boxesOf = (t: Tile, { width, height }: { width: number; height: number }) =>
	packed(t.tiles.length > 0 ? t.tiles : [t], {
		x: 0,
		y: 0,
		width: width + GAP,
		height: height + GAP,
	}).flatMap((p) => placed(p.tile, p.rect, 1));

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

const placed = (tile: Tile, rect: Rect, depth: number): Box[] => {
	const inner = {
		x: rect.x + GAP,
		y: rect.y + HEADER,
		width: rect.width - GAP,
		height: rect.height - HEADER,
	};
	const group = tile.tiles.length > 0 && inner.width > HEADER && inner.height > HEADER;
	const inside = group ? packed(tile.tiles, inner) : [];

	return [
		{ ...tile, ...rect, depth, group },
		...inside.flatMap((p) => placed(p.tile, p.rect, depth + 1)),
	];
};

/** Packs tiles into a rect; a box thinner than a gap could not be told from one, so those are left out and the rest packed again to fill it. */
const packed = (tiles: Tile[], rect: Rect): { tile: Tile; rect: Rect }[] => {
	const rects = squarify(tiles, rect);
	const fits = tiles.flatMap((t, i) => {
		const r = rects[i];
		return r && Math.min(r.width, r.height) >= GAP ? [{ tile: t, rect: r }] : [];
	});

	return fits.length === tiles.length
		? fits
		: packed(
				fits.map((f) => f.tile),
				rect,
			);
};

/** Lays tiles, largest first, in rows along the shorter side, each row grown while it makes its tiles squarer; each rect leaves a gap after it. */
const squarify = (tiles: Tile[], rect: Rect): Rect[] => {
	if (tiles.length === 0) return [];

	const scale = (rect.width * rect.height) / sumOf(tiles.map((t) => t.amount));
	const areas = tiles.map((t) => t.amount * scale);
	const side = Math.min(rect.width, rect.height);
	const longer = areas.findIndex(
		(_, i) => i > 0 && worst(areas.slice(0, i + 1), side) > worst(areas.slice(0, i), side),
	);
	const row = areas.slice(0, longer === -1 ? areas.length : longer);
	const thickness = sumOf(row) / side;
	const across = rect.width >= rect.height;

	const rects = row.map((a, i) => {
		const start = sumOf(row.slice(0, i)) / thickness;
		return across
			? { x: rect.x, y: rect.y + start, width: thickness - GAP, height: a / thickness - GAP }
			: { x: rect.x + start, y: rect.y, width: a / thickness - GAP, height: thickness - GAP };
	});
	const rest = across
		? { ...rect, x: rect.x + thickness, width: rect.width - thickness }
		: { ...rect, y: rect.y + thickness, height: rect.height - thickness };

	return [...rects, ...squarify(tiles.slice(row.length), rest)];
};

/** How far from square the most stretched tile of a row is, laid along a side. */
const worst = (row: number[], side: number) => {
	const s = sumOf(row);
	return Math.max(
		(side * side * Math.max(...row)) / (s * s),
		(s * s) / (side * side * Math.min(...row)),
	);
};
