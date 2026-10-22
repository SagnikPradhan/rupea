<script lang="ts">
	import { listAccountNames, sync, listTransactions } from '#lib/endpoints/transactions.remote.ts';
	import { filterOf, type Filter } from '#lib/shared/filter.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Account from '#lib/web/components/ledger-table/account.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import Source from '#lib/web/components/ledger-table/source.svelte';
	import ListFilter from '#lib/web/components/list-filter/list-filter.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import PagedTable from '#lib/web/components/paged-table/paged-table.svelte';
	import { formatDate, formatIsoDate } from '#lib/web/format.ts';
	import { ledgerCrumb } from '#lib/web/links.ts';
	import { paged } from '#lib/web/paged.svelte.ts';
	import { page } from '$app/state';

	const { data } = $props();

	const day = formatIsoDate(new Date());
	const handle = $derived(data.ledger.handle);
	const filter = $derived(filterOf(page.url.searchParams));

	const issues = $derived(await sync(handle));
	const accounts = $derived(await listAccountNames(handle));
	const first = $derived(await firstPage(handle, filter));
	const list = $derived(paged(first, (after) => listTransactions({ handle, day, filter, after })));

	/** The list reads the index, which the issues query brings up to date. */
	async function firstPage(h: string, f: Filter) {
		await sync(h);
		return listTransactions({ handle: h, day, filter: f, after: null });
	}
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>
	Transactions
	{#snippet actions()}<ListFilter {filter} accounts={accounts.data ?? []} />{/snippet}
</PageHeader>

<Issues {handle} errors={[...issues.errors, ...list.errors]} />

<PagedTable
	columns={[
		{ label: 'Date', kind: 'date' },
		{ label: 'Description' },
		{ label: 'Amount', kind: 'amount' },
	]}
	{list}
	height={64}
	empty="No transactions match."
>
	{#snippet row(index: number)}
		{@const transaction = list.rows[index]}
		{#if transaction}
			<tr class:evidence={!transaction.counted}>
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
			{#each transaction.postings as posting, position (position)}
				<tr class="child" class:evidence={!transaction.counted}>
					<td></td>
					<td>
						<Account account={posting.account} />
					</td>
					<Amount value={posting.quantity} />
				</tr>
			{/each}
		{/if}
	{/snippet}
</PagedTable>

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
