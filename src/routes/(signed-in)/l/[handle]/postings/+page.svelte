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

	const postings = $derived(
		// Evidence of an event is kept in the ledger but not counted.
		(response.data ?? [])
			.filter((transaction) => transaction.counted)
			.flatMap((transaction) =>
				transaction.postings.map((posting, index) => ({
					key: `${transaction.id}:${index}`,
					date: transaction.date,
					description: transaction.description,
					file: transaction.file,
					line: transaction.line,
					...posting,
				})),
			),
	);
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Postings</PageHeader>

<Issues {handle} errors={response.errors} />

<LedgerTable
	columns={[
		{ label: 'Date', kind: 'date' },
		{ label: 'Account' },
		{ label: 'Amount', kind: 'amount' },
	]}
>
	{#each postings as posting (posting.key)}
		<tbody>
			<tr>
				<td class="date"><time datetime={posting.date}>{formatDate(posting.date)}</time></td>
				<th scope="row">
					<Account account={posting.account} />
				</th>
				<Amount value={posting.quantity} />
			</tr>
			<tr class="child">
				<td></td>
				<td class="truncate" title={posting.description}>{posting.description}</td>
				<Source {handle} file={posting.file} line={posting.line} />
			</tr>
		</tbody>
	{/each}
</LedgerTable>

<style>
	th {
		overflow-wrap: break-word;
	}
</style>
