<script lang="ts">
	import Home from '#lib/web/components/app-home/app-home.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import { page } from '$app/state';

	const { data } = $props();

	const asked = $derived(page.url.searchParams.get('ledger'));
	const ledger = $derived(data.ledgers.find((l) => l.handle === asked) ?? data.ledgers[0]);
</script>

<PageHeader subtitle="What changed last month">Home</PageHeader>

{#if ledger}
	<Home handle={ledger.handle} />
{:else}
	<p>You have no ledgers yet.</p>
{/if}
