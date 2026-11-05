<script lang="ts">
	import type { Snippet } from 'svelte';

	const { title, children }: { title?: string; children: Snippet } = $props();
</script>

<span {title}>{@render children()}</span>

<style>
	span {
		display: inline-block;
		padding: var(--size-0) var(--size-2);
		border-radius: var(--radius-1);
		background: var(--color-ink-2);
		color: var(--color-ink);
		font: var(--text-label);
		vertical-align: middle;
		white-space: nowrap;
	}
</style>
