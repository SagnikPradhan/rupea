<script lang="ts">
	import { setContext } from 'svelte';

	const { children } = $props();

	setContext('plain', () => true);
</script>

<div class="content">
	{@render children()}
</div>

<style>
	.content {
		display: grid;
		grid-template-columns: subgrid;
		gap: var(--size-4);
	}

	.content > :global(*) {
		grid-column: 1 / -1;
		margin-block: 0;
	}
</style>
