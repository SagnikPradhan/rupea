import { scaleLinear, scaleSymlog } from 'd3-scale';
import { stack, stackOffsetDiverging, type Series } from 'd3-shape';
import type { Scale } from './choices';

/** How many steps the ink and negative scales in tokens.css have, numbered palest first. */
const INK = 6;
const NEGATIVE = 6;
const STEPS: Record<string, number> = { '--color-ink': INK, '--color-negative': NEGATIVE };

/** How many bars a group can tell apart, one shade of ink each. */
export const PARTS = 5;

/** The part whatever the named parts leave is folded into. */
export const OTHER = 'Other';

/** How many parts of what is owed have a shade of their own, which are fewer than what is held. */
export const OWED = 3;

/** The part whatever the named parts of what is owed leave is folded into. */
export const OTHER_OWED = 'Other owed';

/** The units a plot is drawn in each way, stretched over it, so the server can draw it before the browser knows its size; a position in them is a percent. */
export const VIEW = 100;

/** The least room between two labels on an axis, as a percent of the plot: dates across, amounts up the side. */
export const SPACE = { across: 12, up: 20 };

/** How near the left edge, as a percent of the plot, a date may sit before it is cut in half. */
export const EDGE = 3;

/** The colour token of a part's bar, darkest first; any past the last share its shade. */
export const seriesOf = (k: number) => `--color-ink-${INK - Math.min(k, PARTS - 1)}`;

/** The colour token of a part of what is owed, darkest first; any past the last share its shade. */
export const owedOf = (k: number) => `--color-negative-${NEGATIVE - Math.min(k, OWED - 1)}`;

/** The outline of a shade, two steps darker on its scale, or the full colour past the darkest. */
export const edgeOf = (shade: string) => {
	const at = shade.lastIndexOf('-');
	const scale = shade.slice(0, at);
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
};

/** The value axis, fitted to the piles and lines; a log scale by arcsinh runs through zero to the refunds. */
export const valuesOf = ({ piles, lines, scale }: ValuesOptions) => {
	const values = [...piles.flat(2), ...lines.flat().filter((v) => v !== null)];
	const low = Math.min(...values);
	const high = Math.max(...values);
	const y = (scale === 'log' ? scaleSymlog() : scaleLinear())
		.domain([low, high === low ? low + 1 : high])
		.range([VIEW, 0]);

	return {
		y,
		ticks: scale === 'log' ? powersIn(low, high) : y.ticks(VIEW / SPACE.up),
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
