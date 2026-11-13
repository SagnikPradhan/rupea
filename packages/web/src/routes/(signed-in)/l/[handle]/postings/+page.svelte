<script lang="ts">
	import { listAccountTree } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay, listProblems } from '#lib/endpoints/ledger.remote.ts';
	import { listPostings } from '#lib/endpoints/transactions.remote.ts';
	import { filterOf } from '#lib/web/shared/filter.ts';
	import TransactionAside from '#lib/web/components/app-transaction-aside/app-transaction-aside.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Account from '#lib/web/components/app-ledger-table/account.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import ListChips from '#lib/web/components/app-list-chips/app-list-chips.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import ListViews from '#lib/web/components/app-list-views/app-list-views.svelte';
	import ListSearch from '#lib/web/components/app-list-search/app-list-search.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PagedTable from '#lib/web/components/app-ledger-table-paged/app-ledger-table-paged.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { formatDate, formatIsoDate } from '#lib/web/shared/format.ts';
	import { editHref, hrefWith } from '#lib/web/shared/links.ts';
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

	const params = $derived([...page.url.searchParams]);

	const refresh = async () => {
		await listPostings({ handle, day, filter, after: null }).refresh();
	};
</script>

<PageHeader subtitle="Every line of every transaction, newest first">
	Postings
	{#snippet actions()}
		<ListChips {filter} />
		<ListFilter
			period={filter.period}
			account={filter.account || null}
			accounts={accounts.data ?? []}
			today={day}
			first={earliest}
		/>
		<Button primary href={hrefWith(params, { add: '1' })}>Add transaction</Button>
	{/snippet}
</PageHeader>

<PanelGrid wide>
	<Panel title="Postings" subtitle="newest first">
		<ListViews {handle} chosen="postings"><ListSearch {filter} /></ListViews>

		<Issues {handle} errors={[...issues.errors, ...list.errors]} />

		<PagedTable
			columns={[
				{ label: 'Date', kind: 'date' },
				{ label: 'Account', kind: 'account' },
				{ label: 'Description' },
				{ label: 'Amount', kind: 'amount' },
			]}
			{list}
			height={54}
			empty="No postings match."
		>
			{#snippet row(index: number)}
				{@const posting = list.rows[index]}
				{#if posting}
					<tr>
						<td class="date"><time datetime={posting.date}>{formatDate(posting.date)}</time></td>
						<td class="truncate"><Account account={posting.account} /></td>
						<th scope="row" class="truncate" title={posting.description}>
							<a href={editHref(params, posting.transaction)}>{posting.description}</a>
						</th>
						<Amount value={posting.quantity} />
					</tr>
				{/if}
			{/snippet}
		</PagedTable>
	</Panel>

	<TransactionAside {handle} {refresh} />
</PanelGrid>
