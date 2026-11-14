<script lang="ts">
	import { listAccounts } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay, listProblems } from '#lib/endpoints/ledger.remote.ts';
	import { listTransactions } from '#lib/endpoints/transactions.remote.ts';
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
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import * as Accounts from '#lib/web/shared/accounts.ts';
	import { formatDate, formatIsoDate } from '#lib/web/shared/format.ts';
	import { editHref, hrefWith } from '#lib/web/shared/links.ts';
	import { rowOf } from '#lib/web/shared/transaction-row.ts';
	import { paged } from '#lib/web/shared/paged.svelte.ts';
	import { page } from '$app/state';

	const { data } = $props();

	const day = formatIsoDate(new Date());
	const handle = $derived(data.ledger.handle);
	const filter = $derived(filterOf(page.url.searchParams));

	const [issues, accounts, firstDay, first] = $derived(
		await Promise.all([
			listProblems(handle),
			listAccounts(handle),
			findFirstDay(handle),
			listTransactions({ handle, day, filter, after: null }),
		]),
	);
	const earliest = $derived(firstDay.data ?? null);
	const list = $derived(paged(first, (after) => listTransactions({ handle, day, filter, after })));

	const params = $derived([...page.url.searchParams]);

	const refresh = async () => {
		await listTransactions({ handle, day, filter, after: null }).refresh();
	};
</script>

<PageHeader subtitle="Everything in your ledger, newest first">
	Transactions
	{#snippet actions()}
		<ListChips {filter} />
		<ListFilter
			period={filter.period}
			account={filter.account || null}
			accounts={Accounts.drawnIn(accounts.data ?? [])}
			today={day}
			first={earliest}
		/>
		<Button primary href={hrefWith(params, { add: '1' })}>Add transaction</Button>
	{/snippet}
</PageHeader>

<PanelGrid wide>
	<Panel title="Transactions" subtitle="newest first">
		<ListViews {handle} chosen="transactions"><ListSearch {filter} /></ListViews>

		<Issues {handle} errors={[...issues.errors, ...list.errors]} />

		<PagedTable
			columns={[
				{ label: 'Date', kind: 'date' },
				{ label: 'From / To', kind: 'account', optional: true },
				{ label: 'Description' },
				{ label: 'Amount', kind: 'amount' },
			]}
			{list}
			height={78}
			empty="No transactions match."
		>
			{#snippet row(index: number)}
				{@const transaction = list.rows[index]}
				{#if transaction}
					{@const { from, to, more, amount } = rowOf(transaction.postings)}
					<tr class:evidence={!transaction.counted}>
						<td class="date">
							<time datetime={transaction.date}>{formatDate(transaction.date)}</time>
							{#if transaction.time}<span>{transaction.time}</span>{/if}
						</td>
						<td class="optional truncate">
							<div class="line">
								<span class="name"
									>{#if from}<Account account={from.account} />{/if}</span
								>
							</div>
							<div class="line">
								<span class="name"
									>{#if to}<Account account={to.account} />{/if}</span
								>
								{#if more > 0}<Tag>+{more}</Tag>{/if}
							</div>
						</td>
						<th
							scope="row"
							class="description"
							title={[transaction.description, transaction.comment].filter(Boolean).join('\n')}
						>
							<div class="cell">
								<a href={editHref(params, transaction.id)}>{transaction.description}</a>
								{#if !transaction.counted}<Tag>evidence</Tag>{/if}
								{#if transaction.comment}<span class="comment">; {transaction.comment}</span>{/if}
							</div>
						</th>
						<Amount value={amount} />
					</tr>
				{/if}
			{/snippet}
		</PagedTable>
	</Panel>

	<TransactionAside {handle} {refresh} />
</PanelGrid>

<style>
	td span,
	.comment {
		color: var(--color-muted);
	}

	.line {
		display: flex;
		gap: var(--size-0) var(--size-2);
		align-items: baseline;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cell {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-0) var(--size-2);
		align-items: baseline;
	}

	.evidence :is(td, th, a) {
		color: var(--color-muted);
	}
</style>
