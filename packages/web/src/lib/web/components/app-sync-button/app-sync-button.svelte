<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { findSync, resync } from '#lib/endpoints/ledger.remote.ts';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import { refreshAll } from '$app/navigation';

	const { handle }: { handle: string } = $props();

	const isSyncing = (s: string | null | undefined) => s === 'queued' || s === 'running';

	const syncing = $derived(isSyncing((await findSync(handle)).data));

	$effect(() => {
		if (!syncing) return;

		const timer = setInterval(() => void poll(handle), 2000);
		return () => clearInterval(timer);
	});

	/**
	 * Refreshes the pages once the sync is done; from the effect's teardown it
	 * would run mid-update, which leaves a page that awaits stuck blank.
	 */
	async function poll(h: string) {
		const sync = findSync(h);
		await sync.refresh();
		if (!isSyncing(sync.current?.data)) await refreshAll();
	}
</script>

<span class:syncing>
	<IconButton
		label={syncing ? 'Syncing…' : 'Sync now'}
		icon={ICONS.sync}
		outlined
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
