<script lang="ts">
	import Swatch from '#lib/web/components/ui-swatch/ui-swatch.svelte';
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import { seriesOf, VIEW } from '#lib/web/shared/chart.ts';
	import { formatAmount, formatShare } from '#lib/web/shared/format.ts';
	import type { Arc } from '#lib/web/shared/rings.ts';
	import { arc } from 'd3-shape';

	type Props = {
		/** The arcs of every ring, as ringsOf lays them out. */
		arcs: Arc[];
		levels: number;
		label: string;
		/** Said under the rings, which keep the line free when there is none. */
		note?: string;
	};

	const { arcs, levels, label, note }: Props = $props();

	/** How far from the centre the rings start and end, as a percent of the plot. */
	const HOLE = 22;
	const EDGE = 49;

	const hovered = $state({ arc: null as Arc | null });

	const thickness = $derived((EDGE - HOLE) / levels);
	const shape = $derived(
		arc<Arc>()
			.innerRadius((a) => HOLE + (a.level - 1) * thickness)
			.outerRadius((a) => HOLE + a.level * thickness)
			.startAngle((a) => a.from * 2 * Math.PI)
			.endAngle((a) => a.to * 2 * Math.PI),
	);
	const entries = $derived(arcs.filter((a) => a.own));

	const faded = (part: number) => hovered.arc !== null && hovered.arc.part !== part;
	const centre = (a: Arc) => {
		const [x = 0, y = 0] = shape.centroid(a);
		return { left: VIEW / 2 + x, top: VIEW / 2 + y };
	};
</script>

<figure>
	<div class="row">
		<div class="plot" role="img" aria-label={label}>
			<svg viewBox="0 0 {VIEW} {VIEW}">
				<g transform="translate({VIEW / 2} {VIEW / 2})">
					{#each arcs as a, i (i)}
						<path
							class:faded={faded(a.part)}
							style:--shade="var({seriesOf(a.part)})"
							d={shape(a)}
							role="presentation"
							onpointerenter={() => (hovered.arc = a)}
							onpointerleave={() => (hovered.arc = null)}
						/>
					{/each}
				</g>
			</svg>
			{#if hovered.arc}
				{@const tip = centre(hovered.arc)}
				<Tooltip left={tip.left} top={tip.top}>
					{hovered.arc.label}
					<data>{formatAmount(String(hovered.arc.value))}</data>
				</Tooltip>
			{/if}
		</div>
		<ul>
			{#each entries as a (a.key)}
				<li class={{ group: a.level === 1, faded: faded(a.part) }}>
					<Swatch shade={seriesOf(a.part)} />
					<span class="name">{a.label}</span>
					<data>{formatShare(String(a.share), '1')}</data>
				</li>
			{/each}
		</ul>
	</div>
	<figcaption>{note ?? ''}</figcaption>
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-3);
	}

	.plot {
		position: relative;
		flex: none;
		height: var(--size-height-1);
		aspect-ratio: 1;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	path {
		fill: var(--shade);
		stroke: var(--color-surface);
		stroke-width: var(--size-line-0);
		vector-effect: non-scaling-stroke;
	}

	.faded {
		opacity: 0.2;
	}

	ul {
		flex: 1 1 var(--size-height-0);
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: baseline;
		gap: var(--size-1);
		color: var(--color-muted);
	}

	li.group {
		color: var(--color-ink);
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	data {
		font-family: var(--font-mono);
	}

	figcaption {
		min-height: 1lh;
		color: var(--color-muted);
		font: var(--text-label);
	}
</style>
