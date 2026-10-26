import { isChildOf, nameOf } from './accounts';
import { sumOf } from './chart';
import { OTHER } from './spending';

/** How wide a column's bars are, and the space between two bars in it, in CSS pixels. */
export const NODE = 8;
const GAP = 4;
/** How many accounts the last column names, the largest under any part, so a long history still fits. */
const MOST = 8;
/** The smallest share of the whole an account in the last column takes, as any less would be a hairline. */
const SMALLEST = 0.02;

/** An account in a column, the part whose shade it takes, and the account it flows from. */
export type Flow = {
	account: string;
	label: string;
	amount: number;
	column: number;
	part: number | null;
	from: string | null;
};

/** A flow placed in the chart, as a bar from its top. */
export type Node = {
	account: string;
	label: string;
	amount: number;
	column: number;
	part: number | null;
	from: string | null;
	x: number;
	y: number;
	height: number;
};

/** A band from a part of one bar to the whole of the next, as thick as what flows along it. */
export type Band = {
	account: string;
	part: number | null;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	height: number;
};

type FlowsOptions = {
	rows: { account: string; amount: string }[];
	account: string;
	parts: string[];
};

/** The account, its parts and the rest of it as other, then the largest accounts under the parts, if large enough to see; refunds have nothing to flow. */
export const flowsOf = ({ rows, account, parts }: FlowsOptions): Flow[] => {
	const amounts = Object.fromEntries(rows.map((r) => [r.account, Number(r.amount)]));
	const shares = parts.map((p, k) =>
		flow(p, amounts[p] ?? 0, { column: 1, part: k, from: account }),
	);
	const rest = (amounts[account] ?? 0) - amountOf(shares);
	const other = flow(OTHER, rest, { column: 1, part: parts.length, from: account });
	const middle = [...shares, other].filter((f) => f.amount > 0);
	const whole = amountOf(middle);
	const under = middle
		.flatMap((m) => flowsUnder(rows, m))
		.toSorted((a, b) => b.amount - a.amount)
		.filter((f) => f.amount >= whole * SMALLEST)
		.slice(0, MOST)
		.toSorted((a, b) => (a.part ?? 0) - (b.part ?? 0) || b.amount - a.amount);

	return [flow(account, whole, { column: 0, part: null, from: null }), ...middle, ...under];
};

/** Stacks each column's bars, centred, at one scale so the bands meet them, the first and last at the edges, and runs a band into every bar but the first. */
export const layoutOf = (flows: Flow[], { width, height }: { width: number; height: number }) => {
	const columns = [0, 1, 2].map((c) => flows.filter((f) => f.column === c));
	const scale = Math.min(
		...columns
			.filter((c) => c.length > 0)
			.map((c) => (height - GAP * (c.length - 1)) / amountOf(c)),
	);
	const xs = [0, (width - NODE) / 2, width - NODE];
	const nodes = columns.flatMap((c, i) => stacked(c, { x: xs[i] ?? 0, height, scale }));

	return { nodes, bands: nodes.flatMap((n) => bandsInto(nodes, n)) };
};

/** Where a band's top edge runs at a point across, easing out of one bar and into the next. */
export const edgeAt = (b: Band, x: number) => {
	const t = Math.min(Math.max((x - b.x0) / (b.x1 - b.x0), 0), 1);
	return b.y0 + (b.y1 - b.y0) * t * t * (3 - 2 * t);
};

/** The bar under a point, or the bar a band under it flows into. */
export const nodeAt = (layout: { nodes: Node[]; bands: Band[] }, x: number, y: number) => {
	const bar = layout.nodes.find(
		(n) => x >= n.x - GAP && x <= n.x + NODE + GAP && y >= n.y && y <= n.y + n.height,
	);
	const band = layout.bands.find(
		(b) => x > b.x0 && x < b.x1 && y >= edgeAt(b, x) && y <= edgeAt(b, x) + b.height,
	);

	return bar ?? layout.nodes.find((n) => n.account === band?.account);
};

const flow = (
	account: string,
	amount: number,
	at: { column: number; part: number | null; from: string | null },
): Flow => ({
	account,
	label: nameOf(account),
	amount,
	...at,
});

/** The accounts right under a part, the largest first; other has none. */
const flowsUnder = (rows: { account: string; amount: string }[], parent: Flow) =>
	rows
		.filter((r) => isChildOf(r.account, parent.account))
		.map((r) =>
			flow(r.account, Number(r.amount), { column: 2, part: parent.part, from: parent.account }),
		)
		.filter((f) => f.amount > 0 && parent.account !== OTHER)
		.toSorted((a, b) => b.amount - a.amount);

const stacked = (
	column: Flow[],
	{ x, height, scale }: { x: number; height: number; scale: number },
) => {
	const top = (height - amountOf(column) * scale - GAP * (column.length - 1)) / 2;
	return column.map((f, j) => ({
		...f,
		x,
		y: top + amountOf(column.slice(0, j)) * scale + j * GAP,
		height: f.amount * scale,
	}));
};

/** The band into a bar, leaving its parent below the bands of the siblings before it. */
const bandsInto = (nodes: Node[], node: Node): Band[] => {
	const parent = nodes.find((n) => n.account === node.from && n.column === node.column - 1);
	if (!parent) return [];

	const before = nodes.filter((n) => n.from === node.from && n.column === node.column);
	const offset = amountOf(before.slice(0, before.indexOf(node))) * (node.height / node.amount);
	return [
		{
			account: node.account,
			part: node.part,
			x0: parent.x + NODE,
			y0: parent.y + offset,
			x1: node.x,
			y1: node.y,
			height: node.height,
		},
	];
};

const amountOf = (f: { amount: number }[]) => sumOf(f.map((x) => x.amount));
