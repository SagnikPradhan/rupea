<script lang="ts">
	import { listAccountTree } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay, listProblems } from '#lib/endpoints/ledger.remote.ts';
	import { listTransactions } from '#lib/endpoints/transactions.remote.ts';
	import { filterOf } from '#lib/shared/filter.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Account from '#lib/web/components/ledger-table/account.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import Source from '#lib/web/components/ledger-table/source.svelte';
	import FilterRail from '#lib/web/components/filter-rail/filter-rail.svelte';
	import ListFilter from '#lib/web/components/list-filter/list-filter.svelte';
	import ListSearch from '#lib/web/components/list-search/list-search.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import PagedTable from '#lib/web/components/paged-table/paged-table.svelte';
	import { formatDate, formatIsoDate } from '#lib/web/shared/format.ts';
	import { ledgerCrumb } from '#lib/web/shared/links.ts';
	import { paged } from '#lib/web/shared/paged.svelte.ts';
	import { page } from '$app/state';

	const { data } = $props();

	const day = formatIsoDate(new Date());
	const handle = $derived(data.ledger.handle);
	const filter = $derived(filterOf(page.url.searchParams));

	const issues = $derived(await listProblems(handle));
	const accounts = $derived(await listAccountTree(handle));
	const earliest = $derived((await findFirstDay(handle)).data ?? null);
	const first = $derived(await listTransactions({ handle, day, filter, after: null }));
	const list = $derived(paged(first, (after) => listTransactions({ handle, day, filter, after })));
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Transactions</PageHeader>

<FilterRail>
	{#snippet filters()}
		<ListFilter {filter} accounts={accounts.data ?? []} today={day} first={earliest} />
	{/snippet}

	<div class="tools">
		<ListSearch {filter} />
		<a class="button" href="/l/{handle}/transactions/new">Add</a>
	</div>

	<Issues {handle} errors={[...issues.errors, ...list.errors]} />

	<PagedTable
		columns={[
			{ label: 'Date', kind: 'date' },
			{ label: 'Description' },
			{ label: 'Source', kind: 'source', optional: true },
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
					<th
						scope="row"
						class="truncate"
						title={[transaction.description, transaction.comment].filter(Boolean).join('\n')}
					>
						{#if !transaction.counted}<span class="tag">evidence</span>{/if}
						{transaction.description}
						{#if transaction.comment}<span class="comment">; {transaction.comment}</span>{/if}
					</th>
					<Source {handle} file={transaction.file} line={transaction.line} column />
					<td></td>
				</tr>
				{#each transaction.postings as posting, position (position)}
					<tr class="child" class:evidence={!transaction.counted}>
						<td></td>
						<td>
							<Account account={posting.account} />
						</td>
						<td class="optional"></td>
						<Amount value={posting.quantity} />
					</tr>
				{/each}
			{/if}
		{/snippet}
	</PagedTable>
</FilterRail>

<style>
	.tools {
		display: flex;
		gap: var(--gap-related);
	}

	.tools > :global(form) {
		flex: 1;
	}

	tr.child td {
		overflow-wrap: break-word;
	}

	td span,
	.comment {
		color: var(--color-muted);
	}

	.evidence {
		opacity: 0.6;
	}
</style>
