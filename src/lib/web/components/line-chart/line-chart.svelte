<script lang="ts" generics="Row extends Record<string, unknown>">
	import { axesOf, colorOf, drawZero, fadeOf, plotInto } from '#lib/web/shared/chart.ts';
	import {
		formatAmount,
		formatCompact,
		formatPercent,
		formatShortDate,
	} from '#lib/web/shared/format.ts';
	import type { Snippet } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	/** A field of the rows to plot, by what it means: the one measure a chart shows, what explains it, or what it is weighed against. */
	type Series = {
		key: keyof Row & string;
		label: string;
		role: 'primary' | 'context' | 'reference';
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
	};

	const { rows, x, series, unit = 'amount', label, summary }: Props = $props();

	const WIDTHS = { primary: 2, context: 1, reference: 1 };
	const DASHES = { primary: [], context: [], reference: [4, 4] };
	const FORMATS = {
		amount: { tick: formatCompact, value: formatAmount },
		percent: { tick: formatPercent, value: (v: string) => formatPercent(Number(v)) },
	};

	const hovered = $state({ index: null as number | null });
	const shown = $derived(hovered.index ?? rows.length - 1);

	/** Reads the points before any await, so the chart redraws when they change. */
	const chart = (node: HTMLElement) => {
		const points = data();
		const lines = series.map((s) => ({ ...s }));
		const tick = FORMATS[unit].tick;

		return plotInto(node, (font) => options({ node, font, lines, tick }), points);
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
		const ink = colorOf(node, '--color-ink');
		const muted = colorOf(node, '--color-muted');
		const border = colorOf(node, '--color-border');
		const shade = colorOf(node, '--color-shade-2');

		return {
			width: node.clientWidth,
			height: node.clientHeight,
			padding: [8, 0, 0, 0],
			tzDate: (t) => uPlot.tzDate(new Date(t * 1000), 'Etc/UTC'),
			legend: { show: false },
			cursor: { drag: { x: false, y: false }, points: { show: false }, y: false },
			series: [
				{},
				...lines.map((l) => ({
					label: l.label,
					stroke: l.role === 'primary' ? ink : muted,
					width: WIDTHS[l.role],
					dash: DASHES[l.role],
					points: { show: false },
					...(l.role === 'primary' && {
						fill: (u: uPlot) => fadeOf(u, shade),
						fillTo: (u: uPlot) => u.scales['y']?.min ?? 0,
					}),
				})),
			],
			axes: axesOf(node, font, (s) => formatShortDate(new Date(s * 1000)), tick),
			hooks: {
				setCursor: [(u) => (hovered.index = u.cursor.idx ?? null)],
				draw: [(u) => drawZero(u, border)],
			},
		};
	};
</script>

<figure>
	{@render summary?.(shown)}
	<div class="plot" role="img" aria-label={label} {@attach chart}></div>
	<figcaption>
		{#each series as line (line.key)}
			<span class={line.role}>
				{line.label}
				{#if line.role !== 'primary'}
					<data>{FORMATS[unit].value(String(rows[shown]?.[line.key] ?? ''))}</data>
				{/if}
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

	.primary::before,
	.context::before,
	.reference::before {
		content: '';
		display: inline-block;
		width: 1em;
		margin-right: var(--size-0);
		vertical-align: middle;
		border-top: 1px solid var(--color-muted);
	}

	.primary::before {
		border-top: 2px solid var(--color-ink);
	}

	.reference::before {
		border-top-style: dashed;
	}

	.plot {
		height: 16rem;
		touch-action: pan-y;
	}

	.plot :global(.u-cursor-x) {
		border-right: 1px solid var(--color-muted);
	}
</style>
