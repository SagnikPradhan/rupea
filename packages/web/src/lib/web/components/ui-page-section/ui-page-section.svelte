<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { id: string; title: string; children: Snippet };

	const { id, title, children }: Props = $props();
</script>

<section {id} class="page-section" aria-labelledby="{id}-title">
	<h2 id="{id}-title">{title}</h2>
	<div>{@render children()}</div>
</section>

<style>
	section,
	div {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
	}

	section {
		row-gap: var(--size-3);
		padding-top: var(--size-4);
		scroll-margin-top: var(--size-4);
	}

	div {
		row-gap: var(--size-4);
	}

	h2 {
		grid-column: 1 / -1;
		font: var(--text-heading-1);
	}

	div > :global(*) {
		grid-column: 1 / -1;
	}
</style>
