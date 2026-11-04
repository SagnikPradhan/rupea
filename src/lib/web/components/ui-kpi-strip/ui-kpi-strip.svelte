<script lang="ts">
	import type { Snippet } from 'svelte';

	const { children }: { children: Snippet } = $props();
</script>

<section aria-label="Figures">
	{@render children()}
</section>

<style>
	section {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: var(--size-3);
		padding: var(--size-3);
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-1);
	}

	section > :global(*) {
		grid-column: span 3;
	}

	@media (width < 48rem) {
		section > :global(*) {
			grid-column: span 6;
		}
	}
</style>
