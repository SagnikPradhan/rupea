<script lang="ts">
	import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';
	import { VIEW } from '#lib/web/shared/chart.ts';
	import { formatAmount, formatCompact } from '#lib/web/shared/format.ts';
	import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy';
	import type { Snippet } from 'svelte';

	/** Something worth an amount, boxed with the tiles inside it, or alone when it has none. */
	type Tile = { key: string; label: string; amount: number; tiles: Tile[] };

	type Props = {
		tile: Tile;
		label: string;
		/** Drawn above the plot. */
		summary?: Snippet;
		/** Drawn below the plot, such as a choice of chart. */
		controls?: Snippet;
	};

	const { tile, label, summary, controls }: Props = $props();

	/** The boxes are squarified as if the plot were this many times wider than tall, as most screens draw it, then stretched to its real shape. */
	const ASPECT = 3;

	const hovered = $state({ box: null as HierarchyRectangularNode<Tile> | null });

	const root = $derived(
		treemap<Tile>().size([VIEW * ASPECT, VIEW])(
			hierarchy(tile.tiles.length > 0 ? tile : { ...tile, tiles: [tile] }, (t) => t.tiles).sum(
				(t) => (t.tiles.length > 0 ? 0 : t.amount),
			),
		),
	);
	const byKey = $derived(Object.fromEntries(root.descendants().map((b) => [b.data.key, b])));

	/** Finds the box under the pointer, the innermost one when boxes sit inside a group. */
	const point = (e: PointerEvent) => {
		const key = (e.target as Element).closest<HTMLElement>('.box')?.dataset['key'];
		hovered.box = key === undefined ? null : (byKey[key] ?? null);
	};

	/** Where a box stands inside its group, as a percent of the group's room for boxes. */
	const placeOf = (b: HierarchyRectangularNode<Tile>, group: HierarchyRectangularNode<Tile>) => {
		const width = group.x1 - group.x0;
		const height = group.y1 - group.y0;

		return {
			left: ((b.x0 - group.x0) / width) * 100,
			top: ((b.y0 - group.y0) / height) * 100,
			width: ((b.x1 - b.x0) / width) * 100,
			height: ((b.y1 - b.y0) / height) * 100,
		};
	};

	const shareOf = (b: HierarchyRectangularNode<Tile>) =>
		Math.round((b.data.amount / tile.amount) * 100);
</script>

{#snippet boxes(group: HierarchyRectangularNode<Tile>)}
	{#each group.children ?? [] as box (box.data.key)}
		{@const at = placeOf(box, group)}
		<div
			class={['box', { group: box.children, hovered: hovered.box === box }]}
			data-key={box.data.key}
			style:left="{at.left}%"
			style:top="{at.top}%"
			style:width="{at.width}%"
			style:height="{at.height}%"
		>
			<div class="fill">
				<span class="name">{box.data.label}</span>
				{#if box.children}<div class="boxes">{@render boxes(box)}</div>{/if}
				{#if !box.children}<data>{formatCompact(box.data.amount)}</data>{/if}
			</div>
			{#if hovered.box === box}
				<Tooltip left={50} top={0}>
					{box.data.label}
					<data>{formatAmount(String(box.data.amount))}</data>
					<span class="share">{shareOf(box)}%</span>
				</Tooltip>
			{/if}
		</div>
	{/each}
{/snippet}

<figure>
	{@render summary?.()}
	<div
		class="plot"
		role="img"
		aria-label={label}
		onpointerover={point}
		onpointerleave={() => (hovered.box = null)}
	>
		{@render boxes(root)}
	</div>
	{#if controls}<figcaption>{@render controls()}</figcaption>{/if}
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	figcaption {
		display: flex;
		justify-content: flex-end;
	}

	.plot {
		position: relative;
		height: var(--size-height-1);
		margin: calc(var(--size-1) * -1);
	}

	.box {
		position: absolute;
		container-type: size;
	}

	.box.hovered {
		z-index: 1;
	}

	.fill {
		position: absolute;
		inset: var(--size-1);
		overflow: hidden;
		padding: var(--size-2);
		background: var(--color-ink-2);
		border-radius: var(--radius-1);
		color: var(--color-ink);
		font-size: var(--font-size-1);
	}

	.box.hovered > .fill {
		background-image: linear-gradient(var(--color-ink-2), var(--color-ink-2));
	}

	.boxes {
		position: absolute;
		inset: var(--size-4) var(--size-1) var(--size-1);
	}

	.name {
		display: block;
		line-height: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	data {
		font-family: var(--font-mono);
	}

	.fill > data {
		display: block;
		margin-top: var(--size-0);
		font-size: var(--font-size-0);
	}

	.share {
		color: var(--color-muted);
	}

	/* Container queries cannot read custom properties, so these sizes are in rem: a box is named only when its name has room, and its amount shown only when it fits below. */
	@container (width < 6rem) or (height < 4rem) {
		.box:not(.group) > .fill > .name {
			display: none;
		}
	}

	@container (width < 6rem) or (height < 5.5rem) {
		.fill > data {
			display: none;
		}
	}
</style>
