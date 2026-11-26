<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		wide?: boolean;
		narrow?: boolean;
		full?: boolean;
		children: Snippet;
	};

	const { wide = false, narrow = false, full = false, children }: Props = $props();
</script>

<div class={{ wide, narrow, full }}>
	{@render children()}
</div>

<style>
	div {
		display: grid;
		grid-template-columns: subgrid;
		align-items: start;
		row-gap: var(--size-4);
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

		.wide > :global(:last-child:not(:first-child)) {
			grid-column: span 4;
		}

		.full > :global(*) {
			grid-column: span 12;
		}

		.narrow {
			display: flex;
			column-gap: var(--size-4);
		}

		.narrow > :global(:first-child:not(:last-child)) {
			flex: 1;
			min-width: 0;
		}

		.narrow > :global(:last-child) {
			flex: none;
			margin-inline-start: auto;
		}
	}
</style>
