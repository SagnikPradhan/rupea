<script lang="ts">
	import Axes from '#lib/web/components/ui-chart-axes/ui-chart-axes.svelte';
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import { labelsIn, seriesOf, VIEW } from '#lib/web/shared/chart.ts';
	import type { Dot } from '#lib/web/shared/dots.ts';
	import { formatPercent } from '#lib/web/shared/format.ts';
	import { scaleLinear, scaleSqrt } from 'd3-scale';

	type Props = {
		dots: Dot[];
		across: string;
		label: string;
	};

	const { dots, across, label }: Props = $props();

	/** The widest and narrowest a dot is drawn, as a percent of the plot's width. */
	const WIDEST = 14;
	const NARROWEST = 4;

	const hovered = $state({ dot: null as Dot | null });
	const measured = $state({ rect: undefined as DOMRectReadOnly | undefined });
	const box = $derived({ width: measured.rect?.width ?? 0, height: measured.rect?.height ?? 0 });

	const xs = $derived(
		scaleLinear()
			.domain([0, Math.max(...dots.map((d) => d.across), 0)])
			.nice()
			.range([0, VIEW]),
	);
	const ys = $derived(
		scaleLinear()
			.domain([Math.min(...dots.map((d) => d.up), 0), Math.max(...dots.map((d) => d.up), 0)])
			.nice()
			.range([VIEW, 0]),
	);
	const widths = $derived(
		scaleSqrt()
			.domain([0, Math.max(...dots.map((d) => d.size), 0)])
			.range([NARROWEST, WIDEST]),
	);
	const bottom = $derived(
		xs.ticks(labelsIn(box.width, 'across')).map((n) => ({ at: xs(n), label: formatPercent(n) })),
	);
	const side = $derived(
		ys.ticks(labelsIn(box.height, 'up')).map((n) => ({ at: ys(n), label: formatPercent(n) })),
	);
</script>

<figure>
	<div class="plot">
		<div class="area" role="img" aria-label={label} bind:contentRect={measured.rect}>
			<svg viewBox="0 0 {VIEW} {VIEW}" preserveAspectRatio="none">
				{#each side as tick (tick.at)}
					<line x1="0" x2={VIEW} y1={tick.at} y2={tick.at} />
				{/each}
			</svg>
			<Axes across={bottom} up={side} />
			{#each dots as d (d.key)}
				<span
					class="dot"
					class:faded={hovered.dot !== null && hovered.dot.key !== d.key}
					role="presentation"
					style:left="{xs(d.across)}%"
					style:top="{ys(d.up)}%"
					style:width="{widths(d.size)}%"
					style:--shade="var({seriesOf(d.part)})"
					onpointerenter={() => (hovered.dot = d)}
					onpointerleave={() => (hovered.dot = null)}
				></span>
			{/each}
			{#if hovered.dot}
				<Tooltip left={xs(hovered.dot.across)} top={ys(hovered.dot.up)}>
					{hovered.dot.label}
					<data>{formatPercent(hovered.dot.up)} a year</data>
					<data>swings {formatPercent(hovered.dot.across)}</data>
				</Tooltip>
			{/if}
		</div>
	</div>
	<figcaption>{across} →</figcaption>
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	.plot {
		position: relative;
		height: var(--size-height-0);
	}

	.area {
		position: absolute;
		inset: var(--size-1) var(--size-4) var(--size-3) 0;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	line {
		stroke: var(--color-border);
		vector-effect: non-scaling-stroke;
	}

	.dot {
		position: absolute;
		aspect-ratio: 1;
		background: var(--shade);
		border: var(--size-line-0) solid var(--color-surface);
		border-radius: 50%;
		opacity: 0.85;
		transform: translate(-50%, -50%);
	}

	.faded {
		opacity: 0.2;
	}

	data {
		font-family: var(--font-mono);
	}

	figcaption {
		color: var(--color-muted);
		font: var(--text-label);
		text-align: center;
	}
</style>
