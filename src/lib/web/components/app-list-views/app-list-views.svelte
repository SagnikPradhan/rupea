<script lang="ts">
	import type { Snippet } from 'svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import { page } from '$app/state';

	type Props = {
		handle: string;
		chosen: 'transactions' | 'postings';
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
		align-items: center;
		gap: var(--size-2);
	}

	div > :global(form) {
		flex: 1;
	}
</style>
