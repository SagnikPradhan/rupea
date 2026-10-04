<script lang="ts">
	import { getTransactions } from '#lib/endpoints/transactions.remote.ts';

	const response = $derived(await getTransactions());
	const postings = $derived(
		(response.data ?? []).flatMap((transaction) =>
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
<p><a href="/ledger/transactions">Transactions</a> · <a href="/ledger/files">Files</a></p>

{#each response.errors as error, index (index)}
	<p role="alert">
		{error.type}{'location' in error ? ` at ${error.location}` : ''}
	</p>
{/each}

<table>
	<thead>
		<tr><th>Date</th><th>Account</th><th>Amount</th><th>Description</th><th>Source</th></tr>
	</thead>
	<tbody>
		{#each postings as posting (posting.key)}
			<tr>
				<td>{posting.date}</td>
				<td>{posting.account}</td>
				<td>{posting.amount}</td>
				<td>{posting.description}</td>
				<td>{posting.source}</td>
			</tr>
		{/each}
	</tbody>
</table>
