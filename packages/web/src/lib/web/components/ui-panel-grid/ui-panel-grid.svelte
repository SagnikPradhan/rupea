<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		wide?: boolean;
		narrow?: boolean;
		full?: boolean;
		/** More room between columns, for panels without a card around them. */
		spaced?: boolean;
		children: Snippet;
	};

	const { wide = false, narrow = false, full = false, spaced = false, children }: Props = $props();
</script>

<div class={{ wide, narrow, full, spaced }}>
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

		.spaced > :global(:first-child) {
			padding-inline-end: var(--size-3);
		}

		.spaced > :global(:last-child:not(:first-child)) {
			padding-inline-start: var(--size-3);
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
			min-width: 0;
			flex: 1;
		}

		.narrow > :global(:last-child) {
			margin-inline-start: auto;
			flex: none;
		}
	}
</style>
