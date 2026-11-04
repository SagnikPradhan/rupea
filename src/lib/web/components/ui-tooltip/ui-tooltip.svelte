<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The point it describes, as a percent of its positioned container; the tooltip sits centred above it. */
		left: number;
		top: number;
		children: Snippet;
	};

	const { left, top, children }: Props = $props();
</script>

<p role="tooltip" style:left="{left}%" style:top="{top}%">{@render children()}</p>

<style>
	p {
		position: absolute;
		z-index: 1;
		display: flex;
		gap: var(--size-1);
		padding: var(--size-0) var(--size-1);
		background: var(--color-surface);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
		color: var(--color-ink);
		font: var(--text-label);
		white-space: nowrap;
		pointer-events: none;
		transform: translate(-50%, calc(-100% - var(--size-1)));
	}
</style>
