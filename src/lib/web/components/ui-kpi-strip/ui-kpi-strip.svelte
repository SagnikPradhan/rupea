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
		align-self: end;
		padding: var(--size-3);
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-1);
	}
</style>
