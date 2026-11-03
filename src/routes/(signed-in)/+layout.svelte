<script lang="ts">
	const { children } = $props();
</script>

<div class="content">
	{@render children()}
</div>

<style>
	.content {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	.content > :global(*) {
		margin-block: 0;
	}
</style>
