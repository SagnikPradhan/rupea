<script lang="ts">
	import IconRefresh from '@tabler/icons-svelte-runes/icons/refresh';
	import { findSync, resync } from '#lib/endpoints/ledger.remote.ts';
	import IconButton from '#lib/web/components/icon-button/icon-button.svelte';
	import { refreshAll } from '$app/navigation';

	const { handle }: { handle: string } = $props();

	const latest = $derived((await findSync(handle)).data ?? null);
	const syncing = $derived(latest === 'queued' || latest === 'running');

	// Syncs run as jobs; poll the latest until it is done, then read the page again.
	$effect(() => {
		if (!syncing) return;

		const timer = setInterval(() => void findSync(handle).refresh(), 2000);
		return () => {
			clearInterval(timer);
			void refreshAll();
		};
	});
</script>

<span class:syncing>
	<IconButton
		label={syncing ? 'Syncing…' : 'Sync now'}
		icon={IconRefresh}
		disabled={syncing || resync.pending > 0}
		onclick={() => resync(handle)}
	/>
</span>

<style>
	span {
		display: contents;
	}

	.syncing :global(svg) {
		animation: spin 1s linear infinite;
	}

	@media (prefers-reduced-motion: reduce) {
		.syncing :global(svg) {
			animation: none;
		}
	}

	@keyframes spin {
		to {
			rotate: 1turn;
		}
	}
</style>
