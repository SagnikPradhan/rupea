<script lang="ts" generics="Row extends Record<string, unknown>">
	import type { Bucket } from '#lib/shared/dates.ts';
	import { axesOf, colorOf, drawZero, fillOf, plotInto } from '#lib/web/chart.ts';
	import Swatch from '#lib/web/components/swatch/swatch.svelte';
	import { formatAmount, formatBucket, formatCompact } from '#lib/web/format.ts';
	import type { Snippet } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	/** A field of the rows to plot: a part of each bar, stacked in order from its base, or a dashed line it is weighed against. */
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
		/** Drawn above the plot with the row under the cursor, or none. */
		summary?: Snippet<[number | null]>;
	};

	const { rows, x, bucket, series, whole, label, summary }: Props = $props();

	const WIDTH = { share: 0.6, most: 48 };
	const FADED = 0.2;

	const parts = $derived(series.filter((s) => s.role === 'part'));
	const references = $derived(series.filter((s) => s.role === 'reference'));

	const hovered = $state({ index: null as number | null });
	const focused = { part: null as number | null };
	const plotted: uPlot[] = [];
	const shown = $derived((hovered.index === null ? undefined : rows[hovered.index]) ?? whole);

	/** Reads the bars before any await, so the chart is drawn again when they change. */
	const chart = (node: HTMLElement) => {
		const bars = data();
		const days = rows.map((r) => String(r[x]));
		const name = formatBucket[bucket];

		return plotInto(node, (font) => options({ node, font, days, name }), bars);
	};

	/** Fades every part but one, repainting the chart rather than building it again. */
	const focus = (part: number | null) => {
		focused.part = part;
		plotted.forEach((u) => u.redraw(false, false));
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
	};

	const options = (input: OptionsInput): uPlot.Options => {
		const { node, font, days, name } = input;
		const ink = colorOf(node, '--color-ink');
		const muted = colorOf(node, '--color-muted');
		const border = colorOf(node, '--color-border');
		const day = (i: number) => (Number.isInteger(i) ? name(days[i] ?? '') : '');
		const [across, up] = axesOf(node, font, day, formatCompact);

		return {
			width: node.clientWidth,
			height: node.clientHeight,
			padding: [8, 0, 0, 0],
			legend: { show: false },
			cursor: { drag: { x: false, y: false }, points: { show: false }, y: false },
			scales: {
				x: { time: false, range: [-0.5, days.length - 0.5] },
				y: { range: (u) => extentOf(u) },
			},
			series: [
				{},
				...parts.map((s) => ({ label: s.label, paths: () => null, points: { show: false } })),
				...references.map((s) => ({
					label: s.label,
					stroke: muted,
					width: 1,
					dash: [4, 4],
					points: { show: false },
				})),
			],
			axes: [{ ...across, incrs: [1, 2, 3, 6, 12, 24, 48] }, up],
			hooks: {
				ready: [(u) => plotted.splice(0, plotted.length, u)],
				setCursor: [(u) => (hovered.index = u.cursor.idx ?? null)],
				draw: [(u) => stack(u, ink), (u) => drawZero(u, border)],
			},
		};
	};

	/** How far the stacks and lines reach: what is spent piles up from zero, and what is refunded down from it. */
	const extentOf = (u: uPlot): uPlot.Range.MinMax => {
		const piles = rows.map((_, i) => pilesAt(u, i));
		const lines = u.data
			.slice(parts.length + 1)
			.flatMap((d) => [...d].filter((v) => typeof v === 'number'));
		const low = Math.min(0, ...piles.map((p) => p.down), ...lines);
		const high = Math.max(0, ...piles.map((p) => p.up), ...lines);

		return [low, high === low ? low + 1 : high];
	};

	const pilesAt = (u: uPlot, i: number) => {
		const values = u.data.slice(1, parts.length + 1).map((d) => d[i] ?? 0);
		const up = values.filter((v) => v > 0).reduce((t, v) => t + v, 0);
		const down = values.filter((v) => v < 0).reduce((t, v) => t + v, 0);

		return { up, down };
	};

	/**
	 * Draws each bar's parts in order from zero, upwards for spending and downwards for refunds. A
	 * hatched part lets what is behind it show through, so parts are laid end to end, never over,
	 * with a hairline between them so two hatches never run together.
	 */
	const stack = (u: uPlot, ink: string) => {
		const fills = parts.map((_, k) => fillOf(u.ctx, k, ink));
		const gap = devicePixelRatio;
		const width = Math.min(
			(u.bbox.width / rows.length) * WIDTH.share,
			WIDTH.most * devicePixelRatio,
		);

		u.ctx.save();
		rows.forEach((_, i) => {
			const left = u.valToPos(i, 'x', true) - width / 2;
			const reached = { up: 0, down: 0 };
			parts.forEach((_, k) => {
				const value = u.data[k + 1]?.[i] ?? 0;
				const side = value < 0 ? 'down' : 'up';
				const from = u.valToPos(reached[side], 'y', true);
				reached[side] += value;
				const to = u.valToPos(reached[side], 'y', true);

				u.ctx.globalAlpha = focused.part === null || focused.part === k ? 1 : FADED;
				u.ctx.fillStyle = fills[k] ?? ink;
				u.ctx.fillRect(left, Math.min(from, to), width, Math.max(Math.abs(to - from) - gap, 0));
			});
		});
		u.ctx.restore();
	};
</script>

<figure>
	{@render summary?.(hovered.index)}
	<div class="plot" role="img" aria-label={label} {@attach chart}></div>
	<figcaption>
		{#each parts as part, k (part.key)}
			<span role="presentation" onpointerenter={() => focus(k)} onpointerleave={() => focus(null)}>
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
		height: 16rem;
		touch-action: pan-y;
	}

	.plot :global(.u-cursor-x) {
		border-right: 1px solid var(--color-muted);
	}
</style>
