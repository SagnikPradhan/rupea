<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { id: string; title: string; children: Snippet };

	const { id, title, children }: Props = $props();
</script>

<section {id} aria-labelledby="{id}-title">
	<h2 id="{id}-title">{title}</h2>
	<div>{@render children()}</div>
</section>

<style>
	section,
	div {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}

	section {
		gap: var(--size-3);
		scroll-margin-top: var(--size-4);
	}

	div {
		gap: var(--size-4);
	}

	h2 {
		font: var(--text-heading-1);
	}
</style>
