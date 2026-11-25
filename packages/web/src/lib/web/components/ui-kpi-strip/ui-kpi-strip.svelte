<script lang="ts">
	import type { Snippet } from 'svelte';

	const { children }: { children: Snippet } = $props();
</script>

<section aria-label="Figures">
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
