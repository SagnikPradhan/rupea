<script lang="ts">
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import { seriesOf, VIEW } from '#lib/web/shared/chart.ts';
	import { formatAmount } from '#lib/web/shared/format.ts';
	import { sankey, type SankeyLink, type SankeyNode } from 'd3-sankey';
	import type { Snippet } from 'svelte';

	/** A bar in a column, the part whose shade it takes, and the bar in the column before that flows into it. */
	type Flow = {
		key: string;
		label: string;
		amount: number;
		column: number;
		part: number | null;
		from: string | null;
	};

	type Props = {
		/** The bars, column by column, each in the order it stacks. */
		flows: Flow[];
		label: string;
		/** Drawn above the plot, as nothing is singled out by the cursor. */
		summary?: Snippet<[number | null]>;
		/** Drawn below the plot, such as a choice of chart. */
		controls?: Snippet;
	};

	const { flows, label, summary, controls }: Props = $props();

	/** How wide a bar is, and the space between two in a column, as a percent of the plot. */
	const NODE = 1;
	const GAP = 2;
	/** A name is written beside a bar only when the bar is at least this percent of the plot tall. */
	const NAMED = 8;

	const hovered = $state({ node: null as SankeyNode<Flow, object> | null });

	/** Keeps the bars in the order given, each column stacked once, so the parts line up with the key. */
	const laid = $derived(
		sankey<Flow, object>()
			.nodeId((f) => idOf(f.column, f.key))
			.nodeAlign((f) => f.column)
			.nodeWidth(NODE)
			.nodePadding(GAP)
			.nodeSort(null)
			.linkSort(null)
			.iterations(0)
			.extent([
				[0, 0],
				[VIEW, VIEW],
			])({
			nodes: flows.map((f) => ({ ...f })),
			links: flows.flatMap((f) =>
				f.from === null
					? []
					: [
							{
								source: idOf(f.column - 1, f.from),
								target: idOf(f.column, f.key),
								value: f.amount,
							},
						],
			),
		}),
	);
	const lit = $derived(hovered.node?.part);

	const faded = (part: number | null) => lit !== undefined && part !== null && part !== lit;
	const shadeOf = (part: number | null) => (part === null ? '--color-muted' : seriesOf(part));
	const idOf = (column: number, key: string) => `${column} ${key}`;

	/** A band as the shape between its edges, which stays true when the plot is stretched, as a stroke as wide as the band would not. */
	const bandOf = (link: SankeyLink<Flow, object>) => {
		const from = (link.source as SankeyNode<Flow, object>).x1 ?? 0;
		const to = (link.target as SankeyNode<Flow, object>).x0 ?? 0;
		const half = (link.width ?? 0) / 2;
		const [top, bottom] = [link.y0 ?? 0, link.y1 ?? 0];
		const middle = (from + to) / 2;

		return `M${from},${top - half}C${middle},${top - half} ${middle},${bottom - half} ${to},${bottom - half}L${to},${bottom + half}C${middle},${bottom + half} ${middle},${top + half} ${from},${top + half}Z`;
	};
</script>

<figure>
	{@render summary?.(null)}
	<div class="plot" role="img" aria-label={label}>
		<svg viewBox="0 0 {VIEW} {VIEW}" preserveAspectRatio="none">
			{#each laid.links as link, i (i)}
				{@const into = link.target as SankeyNode<Flow, object>}
				<path
					class="band"
					class:faded={faded(into.part)}
					style:--shade="var({shadeOf(into.part)})"
					d={bandOf(link)}
					role="presentation"
					onpointerenter={() => (hovered.node = into)}
					onpointerleave={() => (hovered.node = null)}
				/>
			{/each}
			{#each laid.nodes as node, i (i)}
				<rect
					class:faded={faded(node.part)}
					style:--shade="var({shadeOf(node.part)})"
					x={node.x0}
					y={node.y0}
					width={NODE}
					height={(node.y1 ?? 0) - (node.y0 ?? 0)}
					role="presentation"
					onpointerenter={() => (hovered.node = node)}
					onpointerleave={() => (hovered.node = null)}
				/>
			{/each}
		</svg>
		{#each laid.nodes as node, i (i)}
			{@const height = (node.y1 ?? 0) - (node.y0 ?? 0)}
			{@const last = node.column === 2}
			{#if node.column > 0 && height >= NAMED}
				<span
					class="name"
					class:last
					style:left="{last ? node.x0 : node.x1}%"
					style:top="{(node.y0 ?? 0) + height / 2}%">{node.label}</span
				>
			{/if}
		{/each}
		{#if hovered.node}
			<Tooltip left={(hovered.node.x0 ?? 0) + NODE / 2} top={hovered.node.y0 ?? 0}>
				{hovered.node.label}
				<data>{formatAmount(String(hovered.node.amount))}</data>
			</Tooltip>
		{/if}
	</div>
	{#if controls}<figcaption>{@render controls()}</figcaption>{/if}
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	figcaption {
		display: flex;
		justify-content: flex-end;
	}

	.plot {
		position: relative;
		height: var(--size-height-0);
		touch-action: pan-y;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	rect {
		fill: var(--shade);
	}

	.band {
		fill: var(--shade);
		fill-opacity: 0.4;
	}

	.faded {
		opacity: 0.2;
	}

	.name {
		position: absolute;
		padding: 0 var(--size-1);
		color: var(--color-ink);
		font: var(--font-size-0) var(--font-mono);
		line-height: 1;
		white-space: nowrap;
		pointer-events: none;
		transform: translateY(-50%);
	}

	.name.last {
		transform: translate(-100%, -50%);
	}

	data {
		font-family: var(--font-mono);
	}
</style>
