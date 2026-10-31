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

	/* From this width the inset leaves a sidebar's room beside the content, which the filters take. */
	@media (width >= 80rem) {
		.rail {
			display: grid;
			grid-template-columns: var(--sidebar) minmax(0, 1fr);
			gap: var(--gap-block);
			margin-left: calc(-1 * (var(--sidebar) + var(--gap-block)));
		}

		aside {
			position: sticky;
			top: var(--gap-related);
			align-self: start;
		}
	}
</style>
