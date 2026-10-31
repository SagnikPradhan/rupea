<script lang="ts">
	import { listAccountTree } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay, listProblems } from '#lib/endpoints/ledger.remote.ts';
	import { listPostings } from '#lib/endpoints/transactions.remote.ts';
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
	const first = $derived(await listPostings({ handle, day, filter, after: null }));
	const list = $derived(paged(first, (after) => listPostings({ handle, day, filter, after })));
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Postings</PageHeader>

<FilterRail>
	{#snippet filters()}
		<ListFilter {filter} accounts={accounts.data ?? []} today={day} first={earliest} />
	{/snippet}

	<ListSearch {filter} />

	<Issues {handle} errors={[...issues.errors, ...list.errors]} />

	<PagedTable
		columns={[
			{ label: 'Date', kind: 'date' },
			{ label: 'Account' },
			{ label: 'Source', kind: 'source', optional: true },
			{ label: 'Amount', kind: 'amount' },
		]}
		{list}
		height={48}
		empty="No postings match."
	>
		{#snippet row(index: number)}
			{@const posting = list.rows[index]}
			{#if posting}
				<tr>
					<td class="date"><time datetime={posting.date}>{formatDate(posting.date)}</time></td>
					<th scope="row">
						<Account account={posting.account} />
					</th>
					<Source {handle} file={posting.file} line={posting.line} column />
					<Amount value={posting.quantity} />
				</tr>
				<tr class="child">
					<td></td>
					<td class="truncate" title={posting.description}>{posting.description}</td>
					<td class="optional"></td>
					<td></td>
				</tr>
			{/if}
		{/snippet}
	</PagedTable>
</FilterRail>

<style>
	th {
		overflow-wrap: break-word;
	}
</style>
