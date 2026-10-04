<script lang="ts">
	import { getTransactions } from '#lib/endpoints/transactions.remote.ts';

	const response = $derived(await getTransactions());
</script>

<h1>Transactions</h1>
<p><a href="/ledger/files">Files</a></p>

{#each response.errors as error, index (index)}
	<p role="alert">
		{error.type}{'location' in error ? ` at ${error.location}` : ''}
	</p>
{/each}

<table>
	<thead>
		<tr><th>Date</th><th>Description</th><th>Postings</th><th>Source</th></tr>
	</thead>
	<tbody>
		{#each response.data ?? [] as transaction (transaction.id)}
			<tr>
				<td>{transaction.date} {transaction.time ?? ''}</td>
				<td>{transaction.description}</td>
				<td>
					{#each transaction.postings as posting, index (index)}
						<div>{posting.account} {posting.amount}</div>
					{/each}
				</td>
				<td>{transaction.file}:{transaction.line}</td>
			</tr>
		{/each}
	</tbody>
</table>
