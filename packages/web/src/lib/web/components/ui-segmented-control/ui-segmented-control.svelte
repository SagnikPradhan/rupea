<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		label: string;
		fill?: boolean;
		/**
		 * A segment with an href is a link; one with only a click handler is a
		 * button.
		 */
		segments: { name: string; chosen: boolean; href?: ResolvedPathname; onclick?: () => void }[];
	};

	const { label, fill = false, segments }: Props = $props();
</script>

<nav aria-label={label} class:fill>
	{#each segments as segment (segment.name)}
		{#if segment.href}
			<a href={segment.href} aria-current={segment.chosen ? 'page' : undefined}>{segment.name}</a>
		{/if}
		{#if !segment.href}
			<button type="button" aria-pressed={segment.chosen} onclick={segment.onclick}>
				{segment.name}
			</button>
		{/if}
	{/each}
</nav>

<style>
	nav {
		display: flex;
		padding: var(--size-0);
		align-items: center;
		background: var(--color-subtle);
		border-radius: var(--radius-1);
	}

	nav.fill {
		flex-wrap: nowrap;
		gap: 0;
	}

	a,
	button {
		padding: var(--size-1) var(--size-2);
		color: var(--color-muted);
		font: inherit;
		text-decoration: none;
		background: none;
		border: var(--size-line-0) solid transparent;
		border-radius: var(--radius-1);
		cursor: pointer;
	}

	.fill a,
	.fill button {
		flex: 1;
		text-align: center;
	}

	a:hover,
	button:hover {
		color: var(--color-ink);
		text-decoration: none;
	}

	a[aria-current],
	button[aria-pressed='true'] {
		color: var(--color-ink);
		text-decoration: none;
		background: var(--color-surface);
		border-color: var(--color-border);
	}
</style>
