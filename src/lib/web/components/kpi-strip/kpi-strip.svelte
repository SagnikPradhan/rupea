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
		grid-template-columns: repeat(auto-fit, minmax(var(--plot-short), 1fr));
		gap: var(--size-3);
		padding: var(--size-3);
		border: var(--line) solid var(--color-subtle);
		border-radius: var(--radius);
	}

	@media (width < 80rem) {
		section {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
