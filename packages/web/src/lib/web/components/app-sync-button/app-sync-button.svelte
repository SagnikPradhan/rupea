<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { findSync, resync } from '#lib/endpoints/ledger.remote.ts';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import { refreshAll } from '$app/navigation';

	const { handle }: { handle: string } = $props();

	const latest = $derived((await findSync(handle)).data ?? null);
	const syncing = $derived(latest === 'queued' || latest === 'running');

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
