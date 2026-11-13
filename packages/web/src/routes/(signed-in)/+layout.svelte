<script lang="ts">
	const { children } = $props();
</script>

<div class="content">
	{@render children()}
</div>

<style>
	.content {
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--size-3);
	}

	.content > :global(*) {
		grid-column: 1 / -1;
		margin-block: 0;
	}
</style>
