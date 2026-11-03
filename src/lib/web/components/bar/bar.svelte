<script lang="ts">
	/** How much of the track is filled, from 0 to 1. */
	const { share }: { share: number } = $props();
</script>

<div class="track" role="presentation">
	<div class="fill" style:width="{Math.min(Math.max(share, 0), 1) * 100}%"></div>
</div>

<style>
	.track {
		height: var(--size-1);
		border-radius: var(--radius);
		background: var(--color-shade-1);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: var(--color-ink);
	}
</style>
