<script lang="ts">
	import { getAccountNames, getIssues, getPostings } from '#lib/endpoints/transactions.remote.ts';
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

	const issues = $derived(await getIssues(handle));
	const accounts = $derived(await getAccountNames(handle));
	const first = $derived(await firstPage(handle, filter));
	const list = $derived(paged(first, (after) => getPostings({ handle, day, filter, after })));

	/** The list reads the index, which the issues query brings up to date. */
	async function firstPage(h: string, f: Filter) {
		await getIssues(h);
		return getPostings({ handle: h, day, filter: f, after: null });
	}
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>
	Postings
	{#snippet actions()}<ListFilter {filter} accounts={accounts.data ?? []} />{/snippet}
</PageHeader>

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
