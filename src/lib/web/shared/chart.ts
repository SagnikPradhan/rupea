import { scaleLinear, scaleSymlog } from 'd3-scale';
import { stack, stackOffsetDiverging, type Series } from 'd3-shape';
import type { Scale } from './choices';

/** How many steps the ink and negative scales in tokens.css have, numbered palest first. */
const INK = 6;
const NEGATIVE = 6;
const STEPS: Record<string, number> = { '--color-ink': INK, '--color-negative': NEGATIVE };

/** How many bars a group can tell apart, one chart colour each. */
export const PARTS = 10;

/** FNV-1a over the lower-cased name, so the same name hashes the same in every ledger. */
const hashOf = (a: string) =>
	[...a.toLowerCase()].reduce(
		(h, c) => Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619) >>> 0,
		2166136261,
	);

/** The colour each account takes from its name alone, so it is the same in every ledger and period; the last colour is kept for the rest. */
export const coloursOf = (a: string[]) =>
	Object.fromEntries(a.map((x) => [x, hashOf(x) % (PARTS - 1)]));

/** Each shown account keeps its colour unless an account before it, in name order, took it, when it moves to the next free one, so no two shown share one. */
export const distinctOf = (shown: string[], colours: Record<string, number>) => {
	const taken: number[] = [];
	return Object.fromEntries(
		shown.toSorted().map((a) => {
			const free = Array.from(
				{ length: PARTS - 1 },
				(_, i) => ((colours[a] ?? 0) + i) % (PARTS - 1),
			);
			const colour = free.find((c) => !taken.includes(c)) ?? free[0] ?? 0;
			taken.push(colour);
			return [a, colour];
		}),
	);
};

/** How much of a part's colour each level under it keeps, the part itself first, so accounts go lighter step by step. */
const TINTS = [1, 0.65, 0.45, 0.3];

export const tintOf = (n: number) => TINTS[Math.min(n, TINTS.length - 1)] ?? 1;

/** The part whatever the named parts leave is folded into. */
export const OTHER = 'Other';

/** How many parts of what is owed have a shade of their own. */
export const OWED = 3;

/** The part whatever the named parts of what is owed leave is folded into. */
export const OTHER_OWED = 'Other owed';

/** The units a plot is drawn in, stretched to fit so the server can draw it unmeasured; a position in them is a percent. */
export const VIEW = 100;

/** The least room between two labels on an axis, in pixels. */
const SPACE = { across: 96, up: 48 };

/** The axis lengths in pixels the server assumes, as it cannot measure them. */
const UNMEASURED = { across: 512, up: 96 };

export const labelsIn = (size: number, axis: 'across' | 'up') => {
	const length = size || UNMEASURED[axis];
	return Math.max(2, Math.floor(length / SPACE[axis]));
};

/** How near the left edge, as a percent of the plot, a date may sit before it is cut in half. */
export const EDGE = 3;

/** The colour token of a part's bar, in the order tokens.css lists the chart colours. */
export const seriesOf = (k: number) => `--color-chart-${Math.min(k, PARTS - 1) + 1}`;

/** The colour token of a part of what is owed, darkest first. */
export const owedOf = (k: number) => `--color-negative-${NEGATIVE - Math.min(k, OWED - 1)}`;

/** The outline of a shade, two steps darker on its scale, or the full colour past the darkest; a chart colour is its own outline. */
export const edgeOf = (shade: string) => {
	const at = shade.lastIndexOf('-');
	const scale = shade.slice(0, at);
	if (scale === '--color-chart') return shade;
	const step = Number(shade.slice(at + 1)) + 2;
	return step > (STEPS[scale] ?? 0) ? scale : `${scale}-${step}`;
};

/** Piles each part on the parts before it that run its way: spending up from zero, refunds down. */
export const stackOf = (rows: Record<string, unknown>[], keys: string[]) =>
	stack<Record<string, unknown>, string>()
		.keys(keys)
		.value((r, k) => Number(r[k] ?? 0))
		.offset(stackOffsetDiverging)(rows);

/** The part whose pile holds a value at a row, or none above the piles and below them. */
export const partAt = (
	piles: Series<Record<string, unknown>, string>[],
	i: number,
	value: number,
) => {
	const k = piles.findIndex((p) => {
		const [from, to] = p[i] ?? [0, 0];
		return value >= Math.min(from, to) && value < Math.max(from, to);
	});

	return k < 0 ? null : k;
};

type ValuesOptions = {
	piles: Series<Record<string, unknown>, string>[];
	lines: (number | null)[][];
	scale: Scale;
	height: number;
};

/** The value axis, fitted to the piles and lines; a log scale by arcsinh runs through zero to the refunds. */
export const valuesOf = ({ piles, lines, scale, height }: ValuesOptions) => {
	const values = [...piles.flat(2), ...lines.flat().filter((v) => v !== null)];
	const low = Math.min(...values);
	const high = Math.max(...values);
	const y = (scale === 'log' ? scaleSymlog() : scaleLinear())
		.domain([low, high === low ? low + 1 : high])
		.range([VIEW, 0]);

	return {
		y,
		ticks: scale === 'log' ? powersIn(low, high) : y.ticks(labelsIn(height, 'up')),
		crossed: low < 0 && high > 0,
	};
};

/** Where the pointer is in the plot it moves over, in the units the plot is drawn in. */
export const pointerIn = (e: PointerEvent) => {
	const box = (e.currentTarget as Element).getBoundingClientRect();
	return {
		left: ((e.clientX - box.left) / box.width) * VIEW,
		top: ((e.clientY - box.top) / box.height) * VIEW,
	};
};

/** Zero and the powers of ten, as the steps between them crowd together on a log scale. */
const powersIn = (low: number, high: number) => {
	const powers = Array.from({ length: 15 }, (_, k) => 10 ** (k + 1));
	return [
		...powers
			.filter((p) => -p >= low)
			.map((p) => -p)
			.toReversed(),
		0,
		...powers.filter((p) => p <= high),
	];
};
