<script lang="ts">
	import { findTransactionFiles } from '#lib/endpoints/files.remote.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import TransactionForm from '#lib/web/components/transaction-form/transaction-form.svelte';
	import { ledgerCrumb } from '#lib/web/shared/links.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const files = $derived(await findTransactionFiles(handle));
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Add a transaction</PageHeader>

<Issues {handle} errors={files.errors} />

{#if files.data}
	<TransactionForm {handle} keys={files.data.keys} newest={files.data.newest} />
{/if}
