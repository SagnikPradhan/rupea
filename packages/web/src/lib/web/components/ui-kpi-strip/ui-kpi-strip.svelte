<script lang="ts">
	import type { Snippet } from 'svelte';

	const { label = 'Figures', children }: { label?: string; children: Snippet } = $props();
</script>

<section aria-label={label}>
	{@render children()}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		align-self: center;
		min-width: calc(var(--size-5) * 3);
	}
</style>
