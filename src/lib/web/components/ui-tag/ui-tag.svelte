<script lang="ts">
	import type { Snippet } from 'svelte';

	const { title, children }: { title?: string; children: Snippet } = $props();
</script>

<span {title}>{@render children()}</span>

<style>
	span {
		padding: 0 var(--size-1);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
		color: var(--color-muted);
		font: var(--text-label);
		vertical-align: middle;
	}
</style>
