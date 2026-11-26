<script lang="ts">
	import type { Snippet } from 'svelte';

	const { id, children }: { id: string; children: Snippet } = $props();
</script>

<section {id} class="page-section">
	{@render children()}
</section>

<style>
	section {
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--size-3);
		scroll-margin-top: var(--size-4);
	}

	section > :global(*) {
		grid-column: 1 / -1;
	}

	:global(.page-section + .page-section) {
		margin-top: var(--size-5);
	}
</style>
