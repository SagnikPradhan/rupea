<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The id the chart's section is labelled by. */
		id: string;
		label: string;
		figure: string;
		/** The figure to the paisa, for a tooltip. */
		exact?: string;
		/** The muted line under the figure. */
		children: Snippet;
	};

	const { id, label, figure, exact, children }: Props = $props();
</script>

<div class="summary">
	<h2 {id} class="label">{label}</h2>
	<p class="text-display figure" title={exact}>{figure}</p>
	<p class="line">{@render children()}</p>
</div>

<style>
	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin-bottom: var(--size-2);
	}

	h2,
	p {
		margin: 0;
	}

	.text-display {
		font-size: min(var(--font-size-4), 12vw);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.line {
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}
</style>
