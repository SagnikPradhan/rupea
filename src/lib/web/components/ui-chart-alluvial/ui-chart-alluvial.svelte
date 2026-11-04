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

	/** A laid-out bar: its flow, and its edges as a percent of the plot. */
	type Box = { flow: Flow; x0: number; x1: number; y0: number; y1: number };

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

	const hovered = $state({ node: null as Box | null });

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
	const boxes = $derived(laid.nodes.map((node) => boxOf(node)));
	const bands = $derived(
		laid.links.map((link) => ({
			into: boxOf(link.target as SankeyNode<Flow, object>),
			d: bandOf(link),
		})),
	);
	const lit = $derived(hovered.node?.flow.part);

	const faded = (part: number | null) => lit !== undefined && part !== null && part !== lit;
	const shadeOf = (part: number | null) => (part === null ? '--color-muted' : seriesOf(part));
	const idOf = (column: number, key: string) => `${column} ${key}`;

	/** d3-sankey types the edges of a laid-out bar as optional, though the layout always sets them. */
	const boxOf = (node: SankeyNode<Flow, object>): Box => ({
		flow: node,
		x0: node.x0 as number,
		x1: node.x1 as number,
		y0: node.y0 as number,
		y1: node.y1 as number,
	});

	/** A band as the shape between its edges, which stays true when the plot is stretched, as a stroke as wide as the band would not. */
	const bandOf = (link: SankeyLink<Flow, object>) => {
		const from = boxOf(link.source as SankeyNode<Flow, object>).x1;
		const to = boxOf(link.target as SankeyNode<Flow, object>).x0;
		const half = (link.width as number) / 2;
		const [top, bottom] = [link.y0 as number, link.y1 as number];
		const middle = (from + to) / 2;

		return `M${from},${top - half}C${middle},${top - half} ${middle},${bottom - half} ${to},${bottom - half}L${to},${bottom + half}C${middle},${bottom + half} ${middle},${top + half} ${from},${top + half}Z`;
	};
</script>

<figure>
	{@render summary?.(null)}
	<div class="plot" role="img" aria-label={label}>
		<svg viewBox="0 0 {VIEW} {VIEW}" preserveAspectRatio="none">
			{#each bands as band, i (i)}
				<path
					class="band"
					class:faded={faded(band.into.flow.part)}
					style:--shade="var({shadeOf(band.into.flow.part)})"
					d={band.d}
					role="presentation"
					onpointerenter={() => (hovered.node = band.into)}
					onpointerleave={() => (hovered.node = null)}
				/>
			{/each}
			{#each boxes as box, i (i)}
				<rect
					class:faded={faded(box.flow.part)}
					style:--shade="var({shadeOf(box.flow.part)})"
					x={box.x0}
					y={box.y0}
					width={NODE}
					height={box.y1 - box.y0}
					role="presentation"
					onpointerenter={() => (hovered.node = box)}
					onpointerleave={() => (hovered.node = null)}
				/>
			{/each}
		</svg>
		{#each boxes as box, i (i)}
			{@const height = box.y1 - box.y0}
			{@const last = box.flow.column === 2}
			{#if box.flow.column > 0 && height >= NAMED}
				<span
					class="name"
					class:last
					style:left="{last ? box.x0 : box.x1}%"
					style:top="{box.y0 + height / 2}%">{box.flow.label}</span
				>
			{/if}
		{/each}
		{#if hovered.node}
			<Tooltip left={hovered.node.x0 + NODE / 2} top={hovered.node.y0}>
				{hovered.node.flow.label}
				<data>{formatAmount(String(hovered.node.flow.amount))}</data>
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
