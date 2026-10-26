<script lang="ts">
	import { formatAmount, formatCompact } from '#lib/web/shared/format.ts';
	import { boxesOf, tileOf, type Box } from '#lib/web/shared/treemap.ts';
	import type { Snippet } from 'svelte';

	type Props = {
		/** Balance accounts with what each holding is worth, as the endpoint returns them. */
		rows: {
			account: string;
			total: string;
			holdings: { commodity: string; value: string | null }[];
		}[];
		/** The account whose parts are boxed. */
		account: string;
		label: string;
		/** Drawn above the plot. */
		summary?: Snippet;
		/** Drawn below the plot, such as a choice of chart. */
		controls?: Snippet;
	};

	const { rows, account, label, summary, controls }: Props = $props();

	/** A box is named only when its name has room to be read, and its amount under it. */
	const NAMED = { width: 80, height: 48 };
	const VALUED = 72;

	const size = $state({ width: 0, height: 0 });
	const hovered = $state({ box: null as Box | null });
	const tile = $derived(tileOf(rows, account));
	const boxes = $derived(boxesOf(tile, size));

	const named = (b: Box) => b.group || (b.width >= NAMED.width && b.height >= NAMED.height);
	const shareOf = (b: Box) => Math.round((b.amount / tile.amount) * 100);
</script>

<figure>
	{@render summary?.()}
	<div
		class="plot"
		role="img"
		aria-label={label}
		bind:clientWidth={size.width}
		bind:clientHeight={size.height}
	>
		{#each boxes as box (box.key)}
			<div
				role="presentation"
				class={['box', { hovered: hovered.box?.key === box.key }]}
				style:left="{box.x}px"
				style:top="{box.y}px"
				style:width="{box.width}px"
				style:height="{box.height}px"
				onpointerenter={() => (hovered.box = box)}
				onpointerleave={() => (hovered.box = null)}
			>
				{#if named(box)}<span class="name">{box.label}</span>{/if}
				{#if !box.group && named(box) && box.height >= VALUED}
					<data>{formatCompact(box.amount)}</data>
				{/if}
			</div>
		{/each}
		{#if hovered.box}
			<p
				class="tip"
				style:left="{hovered.box.x + hovered.box.width / 2}px"
				style:top="{hovered.box.y}px"
			>
				{hovered.box.label}
				<data>{formatAmount(String(hovered.box.amount))}</data>
				<span>{shareOf(hovered.box)}%</span>
			</p>
		{/if}
	</div>
	{#if controls}<figcaption>{@render controls()}</figcaption>{/if}
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		margin: 0;
	}

	figcaption {
		display: flex;
		justify-content: flex-end;
	}

	.plot {
		position: relative;
		height: var(--plot);
	}

	.box {
		position: absolute;
		box-sizing: border-box;
		overflow: hidden;
		padding: var(--size-2);
		background: var(--color-layer);
		border-radius: var(--radius);
		color: var(--color-ink);
		font-size: var(--font-size-1);
	}

	.box.hovered {
		background-image: linear-gradient(var(--color-layer), var(--color-layer));
	}

	.box data {
		display: block;
		margin-top: var(--size-0);
		font-size: var(--font-size-0);
	}

	.name {
		display: block;
		line-height: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.tip span {
		color: var(--color-muted);
	}

	data {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
</style>
