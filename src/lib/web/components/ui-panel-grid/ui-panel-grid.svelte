<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		wide?: boolean;
		narrow?: boolean;
		children: Snippet;
	};

	const { wide = false, narrow = false, children }: Props = $props();
</script>

<div class={{ wide, narrow }}>
	{@render children()}
</div>

<style>
	div {
		display: grid;
		grid-template-columns: subgrid;
		align-items: start;
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

		.wide > :global(:last-child:not(:first-child)) {
			grid-column: span 4;
		}

		.narrow > :global(:first-child) {
			grid-column: span 9;
		}

		.narrow > :global(:last-child) {
			grid-column: span 3;
		}
	}
</style>
