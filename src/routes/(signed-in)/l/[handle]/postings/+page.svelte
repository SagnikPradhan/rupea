<script lang="ts">
	import { getTransactions } from '#lib/endpoints/transactions.remote.ts';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import { formatDate } from '#lib/web/format.ts';

	const { data } = $props();

	const response = $derived(await getTransactions(data.ledger.handle));

	const postings = $derived(
		// Evidence of an event is kept in the ledger but not counted.
		(response.data ?? [])
			.filter((transaction) => transaction.counted)
			.flatMap((transaction) =>
				transaction.postings.map((posting, index) => ({
					key: `${transaction.id}:${index}`,
					date: transaction.date,
					description: transaction.description,
					source: `${transaction.file}:${transaction.line}`,
					...posting,
				})),
			),
	);
</script>

<h1>Postings</h1>

{#each response.errors as error, index (index)}
	<p role="alert">
		{error.type}{'location' in error ? ` at ${error.location}` : ''}
	</p>
{/each}

<LedgerTable
	columns={[
		{ label: 'Date', kind: 'date' },
		{ label: 'Account' },
		{ label: 'Amount', kind: 'amount' },
		{ label: 'Description' },
		{ label: 'Source', optional: true },
	]}
>
	<tbody>
		{#each postings as posting (posting.key)}
			<tr>
				<td class="date">{formatDate(posting.date)}</td>
				<td class="truncate">{posting.account}</td>
				<Amount value={posting.quantity} />
				<td class="truncate">{posting.description}</td>
				<td class="truncate optional">{posting.source}</td>
			</tr>
		{/each}
	</tbody>
</LedgerTable>
