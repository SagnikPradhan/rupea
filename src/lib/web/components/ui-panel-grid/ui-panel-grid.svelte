<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		wide?: boolean;
		children: Snippet;
	};

	const { wide = false, children }: Props = $props();
</script>

<div class={{ wide }}>
	{@render children()}
</div>

<style>
	div {
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--size-3);
	}

	div > :global(*) {
		grid-column: span 12;
	}

	@media (width >= 90rem) {
		div > :global(*) {
			grid-column: span 6;
		}

		.wide > :global(:first-child) {
			grid-column: span 8;
		}

		.wide > :global(:last-child) {
			grid-column: span 4;
		}
	}
</style>
