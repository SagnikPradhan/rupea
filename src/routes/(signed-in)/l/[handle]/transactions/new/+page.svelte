<script lang="ts">
	import { findTransactionFiles } from '#lib/endpoints/files.remote.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import TransactionForm from '#lib/web/components/app-transaction-form/app-transaction-form.svelte';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const files = $derived(await findTransactionFiles(handle));
</script>

<PageHeader>Add a transaction</PageHeader>

<Issues {handle} errors={files.errors} />

{#if files.data}
	<TransactionForm {handle} keys={files.data.keys} newest={files.data.newest} />
{/if}
