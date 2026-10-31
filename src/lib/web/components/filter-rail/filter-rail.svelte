<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Drawn in the margin beside the page on wide screens, and above it otherwise. */
		filters: Snippet;
		children: Snippet;
	};

	const { filters, children }: Props = $props();
</script>

<div class="rail">
	<aside aria-label="Filters">{@render filters()}</aside>
	<div class="page">{@render children()}</div>
</div>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--gap-block);
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: var(--gap-group);
	}

	.page {
		display: flex;
		flex-direction: column;
		gap: var(--gap-block);
		min-width: 0;
	}

	.page > :global(*) {
		margin-block: 0;
	}

	/* From this width the filters take the three columns the content leaves free. */
	@media (width >= 80rem) {
		:global(.content) > .rail {
			display: grid;
			grid-column: 1 / -1;
			grid-template-columns: subgrid;
			column-gap: var(--gap-group);
		}

		aside {
			position: sticky;
			top: var(--gap-related);
			grid-column: 1 / span 3;
			align-self: start;
		}

		.page {
			grid-column: 4 / -1;
		}
	}
</style>
