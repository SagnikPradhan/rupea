<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { id: string; title: string; hint: string; children: Snippet };

	const { id, title, hint, children }: Props = $props();
</script>

<section {id} aria-labelledby="{id}-title">
	<header>
		<h3 id="{id}-title">{title}</h3>
		<p>{hint}</p>
	</header>
	<div>{@render children()}</div>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		min-width: 0;
		scroll-margin-top: var(--size-4);
	}

	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		align-items: start;
	}

	div > :global(*) {
		max-width: 100%;
	}

	div > :global(:has(table)) {
		align-self: stretch;
	}

	header {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	h3 {
		font: var(--text-title);
	}

	p {
		color: var(--color-muted);
		font: var(--text-label);
	}
</style>
