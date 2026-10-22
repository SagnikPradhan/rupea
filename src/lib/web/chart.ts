import uPlot from 'uplot';

const EDGE = 32;

/** Parts of a stacked bar fill from dense at its base to sparse at its top, all in ink, so colour keeps its meaning. */
const DENSITIES = [
	{ kind: 'solid', gap: 0 },
	{ kind: 'hatch', gap: 3 },
	{ kind: 'hatch', gap: 6 },
	{ kind: 'hatch', gap: 10 },
	{ kind: 'dots', gap: 6 },
] as const;

/** How many parts a stacked bar can tell apart. */
export const PARTS = DENSITIES.length;

/** Draws a plot into a node, again when the colour scheme changes, sized to it, and moves its cursor where a finger lands. */
export const plotInto = (
	node: HTMLElement,
	options: (font: string) => uPlot.Options,
	data: uPlot.AlignedData,
) => {
	const dark = matchMedia('(prefers-color-scheme: dark)');
	const plots: uPlot[] = [];

	const draw = async () => {
		const font = await fontOf(node);
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

	draw();
	resize.observe(node);
	dark.addEventListener('change', draw);
	node.addEventListener('pointerdown', touch);
	return () => {
		resize.disconnect();
		dark.removeEventListener('change', draw);
		node.removeEventListener('pointerdown', touch);
		plots.forEach((p) => p.destroy());
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

/** The axis fits the data, so zero is drawn only when the plot crosses it. */
export const drawZero = (u: uPlot, color: string) => {
	const scale = u.scales['y'];
	if (!scale || (scale.min ?? 0) >= 0 || (scale.max ?? 0) <= 0) return;

	const y = u.valToPos(0, 'y', true);
	u.ctx.save();
	u.ctx.strokeStyle = color;
	u.ctx.beginPath();
	u.ctx.moveTo(u.bbox.left, y);
	u.ctx.lineTo(u.bbox.left + u.bbox.width, y);
	u.ctx.stroke();
	u.ctx.restore();
};

/** The fill of a stacked bar's part at its density, in canvas pixels; plain ink where a canvas makes no patterns. */
export const fillOf = (ctx: CanvasRenderingContext2D, part: number, ink: string) => {
	const density = DENSITIES[Math.min(part, PARTS - 1)] ?? DENSITIES[0];
	const size = Math.round(density.gap * devicePixelRatio);
	const tile = document.createElement('canvas');
	const pen = tile.getContext('2d');
	if (density.kind === 'solid' || !pen) return ink;

	tile.width = size;
	tile.height = size;
	pen.fillStyle = ink;
	pen.strokeStyle = ink;
	pen.lineWidth = devicePixelRatio;
	if (density.kind === 'dots') pen.fillRect(0, 0, devicePixelRatio * 1.5, devicePixelRatio * 1.5);
	if (density.kind === 'hatch') hatch(pen, size);

	return ctx.createPattern(tile, 'repeat') ?? ink;
};

/** A diagonal through the tile, and its ends again in the opposite corners, so tiles join into unbroken lines. */
const hatch = (pen: CanvasRenderingContext2D, size: number) => {
	pen.beginPath();
	[-size, 0, size].forEach((shift) => {
		pen.moveTo(shift, size);
		pen.lineTo(shift + size, 0);
	});
	pen.stroke();
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
