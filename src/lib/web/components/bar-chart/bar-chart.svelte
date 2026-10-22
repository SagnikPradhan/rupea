<script lang="ts" generics="Row extends Record<string, unknown>">
	import type { Bucket } from '#lib/shared/dates.ts';
	import { axesOf, colorOf, drawZero, plotInto } from '#lib/web/chart.ts';
	import { formatBucket, formatCompact } from '#lib/web/format.ts';
	import type { Snippet } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	/** A field of the rows to plot: the one measure a chart shows, drawn as bars. */
	type Series = { key: keyof Row & string; label: string; role: 'primary' };

	type Props = {
		/** One row per bar, as an endpoint returns them, with exact decimals. */
		rows: Row[];
		/** The field holding the ISO day each bar starts on. */
		x: keyof Row & string;
		/** How many days one bar adds up, which names it on the axis. */
		bucket: Bucket;
		series: Series[];
		label: string;
		/** Drawn above the plot with the row under the cursor, or none. */
		summary?: Snippet<[number | null]>;
	};

	const { rows, x, bucket, series, label, summary }: Props = $props();

	// Every build of uPlot draws bars, though its types call them optional.
	const BARS = uPlot.paths.bars!({ size: [0.6, 48], gap: 1 });

	const hovered = $state({ index: null as number | null });

	/** Reads the bars before any await, so the chart redraws when they change. */
	const chart = (node: HTMLElement) => {
		const bars = data();
		const days = rows.map((r) => String(r[x]));
		const name = formatBucket[bucket];

		return plotInto(node, (font) => options({ node, font, days, name }), bars);
	};

	/** Bars stand at their index, so a month or a year is as wide as a day. */
	const data = (): uPlot.AlignedData => [
		rows.map((_, i) => i),
		...series.map((s) => rows.map((r) => Number(r[s.key]))),
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
		const border = colorOf(node, '--color-border');
		const day = (i: number) => (Number.isInteger(i) ? name(days[i] ?? '') : '');
		const [across, up] = axesOf(node, font, day, formatCompact);

		return {
			width: node.clientWidth,
			height: node.clientHeight,
			padding: [8, 0, 0, 0],
			legend: { show: false },
			cursor: { drag: { x: false, y: false }, points: { show: false }, y: false },
			scales: { x: { time: false, range: [-0.5, days.length - 0.5] } },
			series: [
				{},
				...series.map((s) => ({
					label: s.label,
					fill: ink,
					stroke: ink,
					width: 0,
					paths: BARS,
					points: { show: false },
				})),
			],
			axes: [{ ...across, incrs: [1, 2, 3, 6, 12, 24, 48] }, up],
			hooks: {
				setCursor: [(u) => (hovered.index = u.cursor.idx ?? null)],
				draw: [(u) => drawZero(u, border)],
			},
		};
	};
</script>

<figure>
	{@render summary?.(hovered.index)}
	<div class="plot" role="img" aria-label={label} {@attach chart}></div>
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin: 0;
	}

	.plot {
		height: 16rem;
		touch-action: pan-y;
	}

	.plot :global(.u-cursor-x) {
		border-right: 1px solid var(--color-muted);
	}
</style>
