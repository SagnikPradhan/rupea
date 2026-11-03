<script lang="ts">
	import type { Snippet } from 'svelte';
	import SegmentedControl from '#lib/web/components/segmented-control/segmented-control.svelte';
	import { page } from '$app/state';

	type Props = {
		handle: string;
		/** The list shown, which the other view links away from. */
		chosen: 'transactions' | 'postings';
		/** Sits to the right of the views. */
		children: Snippet;
	};

	const { handle, chosen, children }: Props = $props();

	const segments = $derived(
		(['transactions', 'postings'] as const).map((view) => ({
			name: view === 'transactions' ? 'Transactions' : 'Postings',
			href: `/l/${handle}/${view}${page.url.search}`,
			chosen: view === chosen,
		})),
	);
</script>

<div>
	<SegmentedControl label="View" {segments} />
	{@render children()}
</div>

<style>
	div {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2);
		align-items: center;
	}

	div > :global(form) {
		flex: 1;
	}
</style>
