import uPlot from 'uplot';
import * as v from 'valibot';

const EDGE = 32;

/** How many bars a group can tell apart, one shade of ink each. */
export const PARTS = 5;

/** The colour token of a part's bar; any past the last share its shade. */
export const seriesOf = (k: number) => `--color-series-${Math.min(k, PARTS - 1) + 1}`;

/** How a chart spaces its values: evenly, or by order of magnitude. */
export const Scale = v.picklist(['linear', 'log']);

export type Scale = v.InferOutput<typeof Scale>;

/** How the scale picker labels each scale. */
export const SCALE_LABELS: Record<Scale, string> = { linear: 'Linear', log: 'Log' };

/** Draws a plot into a node, again when the colour scheme changes, sized to it, and moves its cursor where a finger lands. */
export const plotInto = (
	node: HTMLElement,
	options: (font: string) => uPlot.Options,
	data: uPlot.AlignedData,
) => {
	const plots: uPlot[] = [];
	const removed = new AbortController();

	const draw = async () => {
		const font = await fontOf(node);
		if (removed.signal.aborted) return;

		plots.splice(0).forEach((p) => p.destroy());
		plots.push(new uPlot(options(font), data, node));
	};
	const resize = new ResizeObserver(() =>
		plots.forEach((p) => p.setSize({ width: node.clientWidth, height: node.clientHeight })),
	);
	const touch = (e: PointerEvent) =>
		plots.forEach((p) => {
			const box = p.over.getBoundingClientRect();
			p.setCursor({ left: e.clientX - box.left, top: e.clientY - box.top });
		});

	void draw();
	resize.observe(node);
	const unwatch = watchScheme(draw);
	node.addEventListener('pointerdown', touch);
	return () => {
		removed.abort();
		resize.disconnect();
		unwatch();
		node.removeEventListener('pointerdown', touch);
		plots.forEach((p) => p.destroy());
	};
};

/** Calls back when the page's colours change, by the system's scheme or by the theme picked over it. */
const watchScheme = (changed: () => void) => {
	const dark = matchMedia('(prefers-color-scheme: dark)');
	const theme = new MutationObserver(changed);

	dark.addEventListener('change', changed);
	theme.observe(document.documentElement, { attributeFilter: ['data-theme'] });
	return () => {
		dark.removeEventListener('change', changed);
		theme.disconnect();
	};
};

/** Muted axes without grid or ticks, the values on the right; a label at the left edge is dropped, since the plot starts flush with the text beside it. */
export const axesOf = (
	node: HTMLElement,
	font: string,
	x: (s: number) => string,
	y: (n: number) => string,
): [uPlot.Axis, uPlot.Axis] => {
	const axis = {
		stroke: colorOf(node, '--color-muted'),
		font,
		grid: { show: false },
		ticks: { show: false },
	};

	return [
		{
			...axis,
			size: 32,
			space: 96,
			values: (u, t) => t.map((s) => (u.valToPos(s, 'x') < EDGE ? '' : x(s))),
		},
		{ ...axis, side: 1, size: 48, values: (_, t) => t.map(y) },
	];
};

/** The axis fits the data, so zero is drawn only when the plot crosses it, solid even after a dashed series. */
export const drawZero = (u: uPlot, color: string) => {
	const scale = u.scales['y'];
	if (!scale || (scale.min ?? 0) >= 0 || (scale.max ?? 0) <= 0) return;

	const y = u.valToPos(0, 'y', true);
	u.ctx.save();
	u.ctx.strokeStyle = color;
	u.ctx.setLineDash([]);
	u.ctx.beginPath();
	u.ctx.moveTo(u.bbox.left, y);
	u.ctx.lineTo(u.bbox.left + u.bbox.width, y);
	u.ctx.stroke();
	u.ctx.restore();
};

/** A colour fading from the top of the plot to nothing at its base, to fill under a line. */
export const fadeOf = (u: uPlot, color: string) => {
	const fade = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
	fade.addColorStop(0, color);
	fade.addColorStop(1, 'transparent');
	return fade;
};

/** A canvas cannot read light-dark colours, so each one is resolved through an element. */
export const colorOf = (node: HTMLElement, token: string) => {
	const probe = node.appendChild(document.createElement('span'));
	probe.style.color = `var(${token})`;
	const color = getComputedStyle(probe).color;
	probe.remove();
	return color;
};

const fontOf = async (node: HTMLElement) => {
	const probe = node.appendChild(document.createElement('span'));
	probe.style.font = 'var(--font-size-0) var(--font-mono)';
	const style = getComputedStyle(probe);
	const font = `${style.fontSize} ${style.fontFamily}`;
	probe.remove();
	await document.fonts.load(font);
	return font;
};
