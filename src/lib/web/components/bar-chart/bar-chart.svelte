<script lang="ts" generics="Row extends Record<string, unknown>">
	import type { Bucket } from '#lib/shared/dates.ts';
	import {
		axesOf,
		colorOf,
		drawZero,
		plotInto,
		seriesOf,
		type Scale,
	} from '#lib/web/shared/chart.ts';
	import Swatch from '#lib/web/components/swatch/swatch.svelte';
	import { formatAmount, formatBucket, formatCompact } from '#lib/web/shared/format.ts';
	import type { Snippet } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	/** A field of the rows to plot: a part with a bar in every group, in order from the left, or a dashed curve they are weighed against. */
	type Series = { key: keyof Row & string; label: string; role: 'part' | 'reference' };

	type Props = {
		/** One row per group of bars, as an endpoint returns them, with exact decimals. */
		rows: Row[];
		/** The field holding the ISO day each group starts on. */
		x: keyof Row & string;
		/** How many days one group adds up, which names it on the axis. */
		bucket: Bucket;
		series: Series[];
		/** What the key reads while no bar is under the cursor, such as the parts' totals. */
		whole: Row;
		label: string;
		scale?: Scale;
		/** Drawn above the plot with the row under the cursor, or none. */
		summary?: Snippet<[number | null]>;
	};

	const { rows, x, bucket, series, whole, label, scale = 'linear', summary }: Props = $props();

	const WIDTH = { share: 0.8, most: 96 };
	const FADED = 0.2;
	const CURVE = uPlot.paths.spline?.();
	/** A log scale by arcsinh runs through zero to the refunds, and names only its powers of ten, since its ticks crowd in between. */
	const SCALES: Record<Scale, { distr: uPlot.Scale.Distr; tick: (n: number) => string }> = {
		linear: { distr: 1, tick: formatCompact },
		log: {
			distr: 4,
			tick: (n) => (n === 0 || /^10+$/.test(String(Math.abs(n))) ? formatCompact(n) : ''),
		},
	};

	const parts = $derived(series.filter((s) => s.role === 'part'));
	const references = $derived(series.filter((s) => s.role === 'reference'));

	const hovered = $state({
		index: null as number | null,
		part: null as number | null,
		left: 0,
		top: 0,
	});
	const focused = { part: null as number | null };
	const plotted: uPlot[] = [];
	const shown = $derived((hovered.index === null ? undefined : rows[hovered.index]) ?? whole);

	/** Reads the bars before any await, so the chart is drawn again when they change. */
	const chart = (node: HTMLElement) => {
		const bars = data();
		const days = rows.map((r) => String(r[x]));
		const name = formatBucket[bucket];
		const { distr, tick } = SCALES[scale];

		return plotInto(node, (font) => options({ node, font, days, name, distr, tick }), bars);
	};

	/** Fades every part but one, repainting the chart rather than building it again. */
	const focus = (part: number | null) => {
		focused.part = part;
		plotted.forEach((u) => u.redraw(false, false));
	};

	/** Finds the group and the bar under the cursor, fading the other parts while it is there. */
	const point = (u: uPlot) => {
		const index = u.cursor.idx ?? null;
		const part = index === null ? null : partAt(u, index);
		const bar = barAt(u, index ?? 0, part ?? 0);
		const left = (bar.left + bar.width / 2) / devicePixelRatio;

		Object.assign(hovered, { index, part, left, top: bar.top / devicePixelRatio });
		if (part !== focused.part) focus(part);
	};

	/** Groups stand at their index, so a month or a year is as wide as a day; a missing value leaves a gap in a line. */
	const data = (): uPlot.AlignedData => [
		rows.map((_, i) => i),
		...[...parts, ...references].map((s) =>
			rows.map((r) => (r[s.key] == null ? null : Number(r[s.key]))),
		),
	];

	type OptionsInput = {
		node: HTMLElement;
		font: string;
		days: string[];
		name: (d: string) => string;
		distr: uPlot.Scale.Distr;
		tick: (n: number) => string;
	};

	const options = (input: OptionsInput): uPlot.Options => {
		const { node, font, days, name, distr, tick } = input;
		const muted = colorOf(node, '--color-muted');
		const border = colorOf(node, '--color-border');
		const fills = parts.map((_, k) => colorOf(node, seriesOf(k)));
		const edges = parts.map((_, k) => colorOf(node, `${seriesOf(k)}-edge`));
		const day = (i: number) => (Number.isInteger(i) ? name(days[i] ?? '') : '');
		const [across, up] = axesOf(node, font, day, tick);

		return {
			width: node.clientWidth,
			height: node.clientHeight,
			padding: [8, 0, 0, 0],
			legend: { show: false },
			cursor: { drag: { x: false, y: false }, points: { show: false }, y: false },
			scales: {
				x: { time: false, range: [-0.5, days.length - 0.5] },
				y: { distr, range: (u) => extentOf(u) },
			},
			series: [
				{},
				...parts.map((s) => ({ label: s.label, paths: () => null, points: { show: false } })),
				...references.map((s) => ({
					label: s.label,
					stroke: muted,
					width: 1,
					dash: [4, 4],
					...(CURVE && { paths: CURVE }),
					points: { show: false },
				})),
			],
			axes: [{ ...across, incrs: [1, 2, 3, 6, 12, 24, 48] }, up],
			hooks: {
				ready: [(u) => plotted.splice(0, plotted.length, u)],
				setCursor: [point],
				draw: [(u) => group(u, fills, edges), (u) => drawZero(u, border)],
			},
		};
	};

	/** How far the bars and lines reach, from zero up for spending and down for refunds. */
	const extentOf = (u: uPlot): uPlot.Range.MinMax => {
		const values = u.data.slice(1).flatMap((d) => [...d].filter((v) => typeof v === 'number'));
		const low = Math.min(0, ...values);
		const high = Math.max(0, ...values);

		return [low, high === low ? low + 1 : high];
	};

	/** Stands each part's bar side by side in its group, from zero. */
	const group = (u: uPlot, fills: string[], edges: string[]) => {
		u.ctx.save();
		u.ctx.lineWidth = devicePixelRatio;
		u.ctx.setLineDash([]);
		rows.forEach((_, i) =>
			parts.forEach((_, k) => {
				u.ctx.globalAlpha = focused.part === null || focused.part === k ? 1 : FADED;
				u.ctx.fillStyle = fills[k] ?? '';
				u.ctx.strokeStyle = edges[k] ?? '';
				box(u.ctx, barAt(u, i, k));
			}),
		);
		u.ctx.restore();
	};

	/** Where a part's bar stands in its group, in canvas pixels, with a hairline before the next. */
	const barAt = (u: uPlot, i: number, k: number): Box => {
		const width = Math.min(
			(u.bbox.width / rows.length) * WIDTH.share,
			WIDTH.most * devicePixelRatio,
		);
		const bar = width / parts.length;
		const zero = u.valToPos(0, 'y', true);
		const top = u.valToPos(u.data[k + 1]?.[i] ?? 0, 'y', true);

		return {
			left: u.valToPos(i, 'x', true) - width / 2 + k * bar,
			top: Math.min(top, zero),
			width: bar - devicePixelRatio,
			height: Math.abs(top - zero),
		};
	};

	/** The part whose bar the cursor is over, counting the hairline after it, or none between groups. */
	const partAt = (u: uPlot, i: number) => {
		const left = (u.cursor.left ?? -1) * devicePixelRatio + u.bbox.left;
		const k = parts.findIndex((_, k) => {
			const bar = barAt(u, i, k);
			return left >= bar.left && left < bar.left + bar.width + devicePixelRatio;
		});

		return k < 0 ? null : k;
	};

	type Box = { left: number; top: number; width: number; height: number };

	/** Fills a bar and outlines it inside its edges, so a pale shade still stands out from the page. */
	const box = (ctx: CanvasRenderingContext2D, { left, top, width, height }: Box) => {
		const line = ctx.lineWidth;
		ctx.fillRect(left, top, width, Math.max(height, 0));
		if (height > line) ctx.strokeRect(left + line / 2, top + line / 2, width - line, height - line);
	};
</script>

<figure>
	{@render summary?.(hovered.index)}
	<div class="plot" role="img" aria-label={label} {@attach chart}>
		{#if hovered.index !== null && hovered.part !== null}
			{@const part = parts[hovered.part]}
			<p class="tip" style:left="{hovered.left}px" style:top="{hovered.top}px">
				{part?.label}
				<data>{formatAmount(String(rows[hovered.index]?.[part?.key ?? ''] ?? '0'))}</data>
			</p>
		{/if}
	</div>
	<figcaption>
		{#each parts as part, k (part.key)}
			<span
				role="presentation"
				class:faded={hovered.part !== null && hovered.part !== k}
				onpointerenter={() => focus(k)}
				onpointerleave={() => focus(null)}
			>
				<Swatch part={k} />
				{part.label}
				<data>{formatAmount(String(shown[part.key] ?? '0'))}</data>
			</span>
		{/each}
		{#each references as line (line.key)}
			<span class="reference">
				{line.label}
				{#if shown[line.key] != null}<data>{formatAmount(String(shown[line.key]))}</data>{/if}
			</span>
		{/each}
	</figcaption>
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin: 0;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-0) var(--size-3);
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	data {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.reference::before {
		content: '';
		display: inline-block;
		width: var(--size-2);
		margin-right: var(--size-0);
		vertical-align: middle;
		border-top: 1px dashed var(--color-muted);
	}

	.plot {
		position: relative;
		height: 16rem;
		touch-action: pan-y;
	}

	.tip {
		position: absolute;
		z-index: 1;
		display: flex;
		gap: var(--size-1);
		margin: 0;
		padding: var(--size-0) var(--size-1);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		color: var(--color-ink);
		font-size: var(--font-size-0);
		white-space: nowrap;
		pointer-events: none;
		transform: translate(-50%, calc(-100% - var(--size-1)));
	}

	.faded {
		opacity: 0.6;
	}

	.plot :global(.u-cursor-x) {
		border-right: 1px solid var(--color-muted);
	}
</style>
