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
		gap: var(--size-4);
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	.page {
		display: flex;
		flex-direction: column;
		gap: var(--size-5);
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
			gap: var(--size-5);
			margin-left: calc(-1 * (var(--sidebar) + var(--size-5)));
		}

		aside {
			position: sticky;
			top: var(--size-2);
			align-self: start;
		}
	}
</style>
