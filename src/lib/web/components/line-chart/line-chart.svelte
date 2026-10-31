<script lang="ts" generics="Row extends Record<string, unknown>">
	import Swatch from '#lib/web/components/swatch/swatch.svelte';
	import { axesOf, colorOf, drawZero, fadeOf, pileOf, plotInto } from '#lib/web/shared/chart.ts';
	import {
		formatAmount,
		formatCompact,
		formatPercent,
		formatShortDate,
	} from '#lib/web/shared/format.ts';
	import type { Snippet } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	/** A field of the rows to plot, by what it means: the one measure a chart shows, what explains it, what counts against it, or a part of it piled under the lines in its own shade. */
	type Series = {
		key: keyof Row & string;
		label: string;
		role: 'primary' | 'context' | 'negative' | 'part';
		/** A part's colour token. */
		shade?: string;
	};

	type Props = {
		/** One row per point, as an endpoint returns them, with ISO days and exact decimals. */
		rows: Row[];
		/** The field holding each row's ISO day. */
		x: keyof Row & string;
		series: Series[];
		unit?: 'amount' | 'percent';
		label: string;
		/** Drawn above the plot with the row under the cursor, or the last one. */
		summary?: Snippet<[number]>;
		/** Drawn below the plot opposite the key, such as a choice of chart. */
		controls?: Snippet;
	};

	const { rows, x, series, unit = 'amount', label, summary, controls }: Props = $props();

	const WIDTHS = { primary: 2, context: 1, negative: 1, part: 0 };
	const STROKES = {
		primary: '--color-ink',
		context: '--color-muted',
		negative: '--color-negative',
		part: '--color-muted',
	};
	const FORMATS = {
		amount: { tick: formatCompact, value: formatAmount },
		percent: { tick: formatPercent, value: (v: string) => formatPercent(Number(v)) },
	};

	const FADED = 0.2;

	const hovered = $state({
		index: null as number | null,
		part: null as number | null,
		left: 0,
		top: 0,
	});
	const focused = { part: null as number | null };
	const plotted: uPlot[] = [];
	const shown = $derived(hovered.index ?? rows.length - 1);
	const parts = $derived(series.filter((s) => s.role === 'part'));

	/** Reads the points before any await, so the chart redraws when they change. */
	const chart = (node: HTMLElement) => {
		const points = data();
		const lines = series.map((s) => ({ ...s }));
		const tick = FORMATS[unit].tick;

		return plotInto(node, (font) => options({ node, font, lines, tick }), points);
	};

	/** Fades every part but one, repainting the chart rather than building it again. */
	const focus = (part: number | null) => {
		focused.part = part;
		plotted.forEach((u) => u.redraw(false, false));
	};

	/** Finds the point and the part under the cursor, fading the other parts while it is there. */
	const point = (u: uPlot) => {
		const index = u.cursor.idx ?? null;
		const part = index === null || parts.length === 0 ? null : partAt(u, index);

		Object.assign(
			hovered,
			{ index, part },
			index !== null && part !== null && tipAt(u, index, part),
		);
		if (part !== focused.part) focus(part);
	};

	/** Where a part's tip stands, in CSS pixels: over its point, on the top edge of its area. */
	const tipAt = (u: uPlot, i: number, k: number) => {
		const { base, top } = pileAt(u, i, k);
		const x = u.valToPos(Number(u.data[0][i]), 'x', true);
		const y = u.valToPos(Math.max(base, top), 'y', true);

		return { left: x / devicePixelRatio, top: y / devicePixelRatio };
	};

	const data = (): uPlot.AlignedData => [
		rows.map((r) => Date.parse(String(r[x])) / 1000),
		...series.map((s) => rows.map((r) => Number(r[s.key]))),
	];

	type OptionsInput = {
		node: HTMLElement;
		font: string;
		lines: Series[];
		tick: (n: number) => string;
	};

	const options = (input: OptionsInput): uPlot.Options => {
		const { node, font, lines, tick } = input;
		const border = colorOf(node, '--color-border');
		const shade = colorOf(node, '--color-series-5');
		const fills = parts.map((p) => colorOf(node, p.shade ?? '--color-muted'));

		return {
			width: node.clientWidth,
			height: node.clientHeight,
			padding: [8, 0, 0, 0],
			tzDate: (t) => uPlot.tzDate(new Date(t * 1000), 'Etc/UTC'),
			legend: { show: false },
			cursor: { drag: { x: false, y: false }, points: { show: false }, y: false },
			scales: parts.length > 0 ? { y: { range: (u) => extentOf(u) } } : {},
			series: [
				{},
				...lines.map((l) => ({
					label: l.label,
					stroke: colorOf(node, STROKES[l.role]),
					width: WIDTHS[l.role],
					points: { show: false },
					...(l.role === 'part' && { paths: () => null }),
					...(l.role === 'primary' &&
						parts.length === 0 && {
							fill: (u: uPlot) => fadeOf(u, shade),
							fillTo: (u: uPlot) => u.scales['y']?.min ?? 0,
						}),
				})),
			],
			axes: axesOf(node, font, (s) => formatShortDate(new Date(s * 1000)), tick),
			hooks: {
				ready: [(u) => plotted.splice(0, plotted.length, u)],
				setCursor: [point],
				drawClear: [(u) => pile(u, fills)],
				draw: [(u) => drawZero(u, border)],
			},
		};
	};

	/** Fits the lines and the piles of parts each way, with zero in view when there are parts. */
	const extentOf = (u: uPlot): uPlot.Range.MinMax => {
		const piles = rows.flatMap((_, i) => [pileOf(amountsAt(u, i), 1), pileOf(amountsAt(u, i), -1)]);
		const lines = u.data
			.slice(1)
			.filter((_, j) => series[j]?.role !== 'part')
			.flatMap((d) => [...d].filter((v) => typeof v === 'number'));
		const values = [...piles, ...lines];

		return [Math.min(...values), Math.max(...values)];
	};

	/** Paints each part's area on the parts before it that run the same way, under the lines. */
	const pile = (u: uPlot, fills: string[]) => {
		u.ctx.save();
		parts.forEach((_, k) => {
			const edges = rows.map((_, i) => ({
				x: u.valToPos(Number(u.data[0][i]), 'x', true),
				...pileAt(u, i, k),
			}));
			u.ctx.globalAlpha = focused.part === null || focused.part === k ? 1 : FADED;
			u.ctx.fillStyle = fills[k] ?? '';
			u.ctx.beginPath();
			edges.forEach((e) => u.ctx.lineTo(e.x, u.valToPos(e.top, 'y', true)));
			edges.toReversed().forEach((e) => u.ctx.lineTo(e.x, u.valToPos(e.base, 'y', true)));
			u.ctx.closePath();
			u.ctx.fill();
		});
		u.ctx.restore();
	};

	/** Where a part runs at a point, from the pile of the parts before it that run its way. */
	const pileAt = (u: uPlot, i: number, k: number) => {
		const amounts = amountsAt(u, i);
		const amount = amounts[k] ?? 0;
		const base = pileOf(amounts.slice(0, k), amount < 0 ? -1 : 1);

		return { base, top: base + amount };
	};

	/** The part the cursor is over, or none above the piles or below them. */
	const partAt = (u: uPlot, i: number) => {
		const value = u.posToVal(u.cursor.top ?? -1, 'y');
		const k = parts.findIndex((_, k) => {
			const { base, top } = pileAt(u, i, k);
			return value >= Math.min(base, top) && value < Math.max(base, top);
		});

		return k < 0 ? null : k;
	};

	const amountsAt = (u: uPlot, i: number) =>
		series.flatMap((s, j) => (s.role === 'part' ? [u.data[j + 1]?.[i] ?? 0] : []));
</script>

<figure>
	{@render summary?.(shown)}
	<div class="plot" role="img" aria-label={label} {@attach chart}>
		{#if hovered.index !== null && hovered.part !== null}
			{@const part = parts[hovered.part]}
			<p class="tip" style:left="{hovered.left}px" style:top="{hovered.top}px">
				{part?.label}
				<data>{FORMATS[unit].value(String(rows[hovered.index]?.[part?.key ?? ''] ?? '0'))}</data>
			</p>
		{/if}
	</div>
	<figcaption>
		<div class="key">
			{#each series as line (line.key)}
				{@const k = parts.indexOf(line)}
				<span
					role="presentation"
					class={[line.role, { faded: k >= 0 && hovered.part !== null && hovered.part !== k }]}
					onpointerenter={() => k >= 0 && focus(k)}
					onpointerleave={() => k >= 0 && focus(null)}
				>
					{#if line.shade}<Swatch shade={line.shade} />{/if}
					{line.label}
					{#if line.role !== 'primary'}
						<data>{FORMATS[unit].value(String(rows[shown]?.[line.key] ?? ''))}</data>
					{/if}
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
		gap: var(--gap-label);
		margin: 0;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: start;
		gap: var(--gap-related) var(--gap-block);
		color: var(--color-muted);
		font-size: var(--text-small);
	}

	.key {
		flex: 1 1 var(--sidebar);
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-tight) var(--gap-group);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: var(--gap-label) var(--gap-group);
		margin-left: auto;
	}

	data {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.primary::before,
	.context::before,
	.reference::before {
		content: '';
		display: inline-block;
		width: 1em;
		margin-right: var(--gap-tight);
		vertical-align: middle;
		border-top: 1px solid var(--color-muted);
	}

	.primary::before {
		border-top: 2px solid var(--color-ink);
	}

	.negative::before {
		border-top-color: var(--color-negative);
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
		gap: var(--gap-label);
		margin: 0;
		padding: var(--gap-tight) var(--gap-label);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		color: var(--color-ink);
		font-size: var(--text-small);
		white-space: nowrap;
		pointer-events: none;
		transform: translate(-50%, calc(-100% - var(--gap-label)));
	}

	.faded {
		opacity: 0.6;
	}

	.plot :global(.u-cursor-x) {
		border-right: 1px solid var(--color-muted);
	}
</style>
