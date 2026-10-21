<script lang="ts">
	import { getTransactions } from '#lib/endpoints/transactions.remote.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Account from '#lib/web/components/ledger-table/account.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import Source from '#lib/web/components/ledger-table/source.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { formatDate } from '#lib/web/format.ts';
	import { ledgerCrumb } from '#lib/web/links.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const response = $derived(await getTransactions(handle));
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Transactions</PageHeader>

<Issues {handle} errors={response.errors} />

<LedgerTable
	columns={[
		{ label: 'Date', kind: 'date' },
		{ label: 'Description' },
		{ label: 'Amount', kind: 'amount' },
	]}
>
	{#each response.data ?? [] as transaction (transaction.id)}
		<tbody class:evidence={!transaction.counted}>
			<tr>
				<td class="date">
					<time datetime={transaction.date}>{formatDate(transaction.date)}</time>
					{#if transaction.time}<span>{transaction.time}</span>{/if}
				</td>
				<th scope="row" class="truncate" title={transaction.description}>
					{#if !transaction.counted}<span class="tag">evidence</span>{/if}
					{transaction.description}
				</th>
				<Source {handle} file={transaction.file} line={transaction.line} />
			</tr>
			{#each transaction.postings as posting, index (index)}
				<tr class="child">
					<td></td>
					<td>
						<Account account={posting.account} />
					</td>
					<Amount value={posting.quantity} />
				</tr>
			{/each}
		</tbody>
	{/each}
</LedgerTable>

<style>
	tr.child td {
		overflow-wrap: break-word;
	}

	td span {
		color: var(--color-muted);
	}

	.evidence {
		opacity: 0.6;
	}
</style>
