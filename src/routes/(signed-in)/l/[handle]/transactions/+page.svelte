<script lang="ts">
	import { getTransactions } from '#lib/endpoints/transactions.remote.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import Source from '#lib/web/components/ledger-table/source.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { isWarning } from '#lib/web/errors.ts';
	import { formatDate } from '#lib/web/format.ts';
	import { ledgerCrumb } from '#lib/web/links.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const response = $derived(await getTransactions(handle));

	const problems = $derived(response.errors.filter((e) => !isWarning(e)));
	const warnings = $derived(response.errors.filter(isWarning));
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Transactions</PageHeader>

<Issues {handle} errors={problems} />
<Issues {handle} errors={warnings} warning />

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
						{#each posting.account.split(':') as part, i (i)}{i > 0 ? ':' : ''}<wbr />{part}{/each}
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
