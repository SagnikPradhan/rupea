<script lang="ts">
	import { listAccountTree } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay, listProblems } from '#lib/endpoints/ledger.remote.ts';
	import { listPostings } from '#lib/endpoints/transactions.remote.ts';
	import { filterOf } from '#lib/shared/filter.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Account from '#lib/web/components/app-ledger-table/account.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import Source from '#lib/web/components/app-ledger-table/source.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import ListViews from '#lib/web/components/app-list-views/app-list-views.svelte';
	import ListSearch from '#lib/web/components/app-list-search/app-list-search.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PagedTable from '#lib/web/components/app-ledger-table-paged/app-ledger-table-paged.svelte';
	import { formatDate, formatIsoDate } from '#lib/web/shared/format.ts';
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

<PageHeader>
	Postings
	{#snippet actions()}
		<ListFilter
			period={filter.period}
			account={filter.account || null}
			accounts={accounts.data ?? []}
			today={day}
			first={earliest}
		/>
	{/snippet}
</PageHeader>

<ListViews {handle} chosen="postings"><ListSearch {filter} /></ListViews>

<Issues {handle} errors={[...issues.errors, ...list.errors]} />

<PagedTable
	columns={[
		{ label: 'Date', kind: 'date' },
		{ label: 'Account' },
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
				<Amount value={posting.quantity} />
			</tr>
			<tr class="child">
				<td></td>
				<td class="truncate" title={posting.description}>{posting.description}</td>
				<Source {handle} file={posting.file} line={posting.line} />
			</tr>
		{/if}
	{/snippet}
</PagedTable>

<style>
	th {
		overflow-wrap: break-word;
	}
</style>
