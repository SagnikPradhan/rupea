<script lang="ts">
	type Props = {
		/** How much of the track is filled, from 0 to 1. */
		share: number;
		/** Where a limit sits on the track, from 0 to 1; past it the fill is over. */
		limit?: number;
	};

	const { share, limit }: Props = $props();

	const filled = $derived(Math.min(Math.max(share, 0), 1));
	const within = $derived(limit === undefined ? filled : Math.min(filled, limit));
</script>

<div class="track" role="presentation">
	<div class="fill" style:width="{within * 100}%"></div>
	{#if limit !== undefined}
		{@const over = Math.max(filled - limit, 0)}
		<div class="over" style:left="{limit * 100}%" style:width="{over * 100}%"></div>
		<div class="tick" style:left="{limit * 100}%"></div>
	{/if}
</div>

<style>
	.track {
		position: relative;
		height: var(--size-1);
		border-radius: var(--radius-1);
		background: var(--color-subtle);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: var(--color-ink);
	}

	.over,
	.tick {
		position: absolute;
		top: 0;
		height: 100%;
	}

	.over {
		background: var(--color-negative);
	}

	.tick {
		width: var(--size-line-1);
		background: var(--color-ink);
	}
</style>
