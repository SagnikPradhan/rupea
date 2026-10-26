<script lang="ts" generics="Row extends Record<string, unknown>">
	import type { Bucket } from '#lib/shared/dates.ts';
	import { axesOf, colorOf, drawZero, pileOf, plotInto, seriesOf } from '#lib/web/shared/chart.ts';
	import type { Scale } from '#lib/web/shared/choices.ts';
	import Swatch from '#lib/web/components/swatch/swatch.svelte';
	import { formatAmount, formatBucket, formatCompact } from '#lib/web/shared/format.ts';
	import type { Snippet } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	/** A field of the rows to plot: a part piled into every bar, in order from zero, or a dashed curve they are weighed against. */
	type Series = { key: keyof Row & string; label: string; role: 'part' | 'reference' };

	type Props = {
		/** One row per bar, as an endpoint returns them, with exact decimals. */
		rows: Row[];
		/** The field holding the ISO day each bar starts on. */
		x: keyof Row & string;
		/** How many days one bar adds up, which names it on the axis. */
		bucket: Bucket;
		series: Series[];
		/** What the key reads while no bar is under the cursor, such as the parts' totals. */
		whole: Row;
		label: string;
		scale?: Scale;
		/** Drawn above the plot with the row under the cursor, or none. */
		summary?: Snippet<[number | null]>;
		/** Drawn at the end of the key, such as a choice of scale. */
		controls?: Snippet;
	};

	const {
		rows,
		x,
		bucket,
		series,
		whole,
		label,
		scale = 'linear',
		summary,
		controls,
	}: Props = $props();

	const WIDTH = { share: 0.6, most: 48 };
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

	/** Finds the bar and the part of it under the cursor, fading the other parts while it is there. */
	const point = (u: uPlot) => {
		const index = u.cursor.idx ?? null;
		const part = index === null ? null : partAt(u, index);
		const bar = barAt(u, index ?? 0, part ?? 0);
		const left = (bar.left + bar.width / 2) / devicePixelRatio;

		Object.assign(hovered, { index, part, left, top: bar.top / devicePixelRatio });
		if (part !== focused.part) focus(part);
	};

	/** Bars stand at their index, so a month or a year is as wide as a day; a missing value leaves a gap in a line. */
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
				draw: [(u) => stack(u, fills, edges), (u) => drawZero(u, border)],
			},
		};
	};

	/** How far the bars and lines reach, from zero up for spending and down for refunds. */
	const extentOf = (u: uPlot): uPlot.Range.MinMax => {
		const piles = rows.flatMap((_, i) => [pileOf(amountsAt(u, i), 1), pileOf(amountsAt(u, i), -1)]);
		const lines = u.data
			.slice(parts.length + 1)
			.flatMap((d) => [...d].filter((v) => typeof v === 'number'));
		const low = Math.min(0, ...piles, ...lines);
		const high = Math.max(0, ...piles, ...lines);

		return [low, high === low ? low + 1 : high];
	};

	/** Piles each part on the ones before it, spending up from zero and refunds down. */
	const stack = (u: uPlot, fills: string[], edges: string[]) => {
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

	/** Where a part stands in its bar, in canvas pixels, on top of the parts before it that run the same way. */
	const barAt = (u: uPlot, i: number, k: number): Box => {
		const width = Math.min(
			(u.bbox.width / rows.length) * WIDTH.share,
			WIDTH.most * devicePixelRatio,
		);
		const amounts = amountsAt(u, i);
		const amount = amounts[k] ?? 0;
		const base = pileOf(amounts.slice(0, k), Math.sign(amount));
		const from = u.valToPos(base, 'y', true);
		const to = u.valToPos(base + amount, 'y', true);

		return {
			left: u.valToPos(i, 'x', true) - width / 2,
			top: Math.min(from, to),
			width,
			height: Math.abs(to - from),
		};
	};

	/** The part the cursor is over, or none beside the bar or above it. */
	const partAt = (u: uPlot, i: number) => {
		const left = (u.cursor.left ?? -1) * devicePixelRatio + u.bbox.left;
		const top = (u.cursor.top ?? -1) * devicePixelRatio + u.bbox.top;
		const k = parts.findIndex((_, k) => {
			const bar = barAt(u, i, k);
			return (
				left >= bar.left &&
				left < bar.left + bar.width &&
				top >= bar.top &&
				top < bar.top + bar.height
			);
		});

		return k < 0 ? null : k;
	};

	const amountsAt = (u: uPlot, i: number) => parts.map((_, k) => u.data[k + 1]?.[i] ?? 0);

	/** What the amounts running one way add up to: up for spending, down for refunds. */

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
		<div class="key">
			{#each parts as part, k (part.key)}
				<span
					role="presentation"
					class:faded={hovered.part !== null && hovered.part !== k}
					onpointerenter={() => focus(k)}
					onpointerleave={() => focus(null)}
				>
					<Swatch shade={seriesOf(k)} />
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
		</div>
		{#if controls}<div class="controls">{@render controls()}</div>{/if}
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
		justify-content: space-between;
		align-items: start;
		gap: var(--size-2) var(--size-5);
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	.key {
		flex: 1 1 var(--sidebar);
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-0) var(--size-3);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: var(--size-1) var(--size-3);
		margin-left: auto;
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
		height: var(--plot);
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
