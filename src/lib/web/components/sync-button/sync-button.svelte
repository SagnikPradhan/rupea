<script lang="ts">
	import { findSync, sync } from '#lib/endpoints/ledger.remote.ts';
	import Button from '#lib/web/components/button/button.svelte';

	type Props = {
		handle: string;
		/** Reads the ledger again once a sync is done. */
		onsynced: () => void;
	};

	const { handle, onsynced }: Props = $props();

	const latest = $derived((await findSync(handle)).data ?? null);
	const syncing = $derived(latest === 'queued' || latest === 'running');

	// Syncs run as jobs; poll the latest until it is done, then read what it indexed.
	$effect(() => {
		if (!syncing) return;

		const timer = setInterval(() => void findSync(handle).refresh(), 2000);
		return () => {
			clearInterval(timer);
			onsynced();
		};
	});
</script>

<Button disabled={syncing || sync.pending > 0} onclick={() => sync(handle)}>
	{syncing ? 'Syncing…' : 'Sync now'}
</Button>
