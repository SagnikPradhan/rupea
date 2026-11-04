<script lang="ts">
	type Props = {
		label: string;
		/** Stretch to the width given, with equal segments. */
		fill?: boolean;
		/** The views to pick from, each a link, with the chosen one marked. */
		segments: { name: string; href: string; chosen: boolean }[];
	};

	const { label, fill = false, segments }: Props = $props();
</script>

<nav aria-label={label} class:fill>
	{#each segments as segment (segment.href)}
		<a href={segment.href} aria-current={segment.chosen ? 'page' : undefined}>{segment.name}</a>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		align-items: center;
		padding: var(--size-0);
		border-radius: var(--radius);
		background: var(--color-subtle);
	}

	nav.fill {
		flex-wrap: nowrap;
		gap: 0;
	}

	a {
		padding: var(--size-1) var(--size-2);
		border: var(--line) solid transparent;
		border-radius: var(--radius);
		color: var(--color-muted);
		text-decoration: none;
	}

	.fill a {
		flex: 1;
		text-align: center;
	}

	a:hover {
		color: var(--color-ink);
		text-decoration: none;
	}

	a[aria-current] {
		border-color: var(--color-border);
		background: var(--color-surface);
		color: var(--color-ink);
		text-decoration: none;
	}
</style>
