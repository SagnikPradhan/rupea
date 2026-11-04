<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		id: string;
		label: string;
		figure: string;
		exact?: string;
		children: Snippet;
	};

	const { id, label, figure, exact, children }: Props = $props();
</script>

<div class="summary">
	<h2 {id}>{label}</h2>
	<p class="figure" title={exact}>{figure}</p>
	<p class="line">{@render children()}</p>
</div>

<style>
	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin-bottom: var(--size-2);
	}

	h2 {
		color: var(--color-muted);
		font: var(--text-label);
	}

	.figure {
		font: var(--text-display);
		font-size: min(var(--font-size-4), 12vw);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.line {
		color: var(--color-muted);
		font: var(--text-label);
	}
</style>
