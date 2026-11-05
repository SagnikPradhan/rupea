<script lang="ts">
	import { listAccountTree } from '#lib/endpoints/accounts.remote.ts';
	import { findTransaction, findTransactionFiles } from '#lib/endpoints/files.remote.ts';
	import { findFirstDay, listProblems } from '#lib/endpoints/ledger.remote.ts';
	import { listTransactions } from '#lib/endpoints/transactions.remote.ts';
	import { filterOf } from '#lib/shared/filter.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import TransactionForm from '#lib/web/components/app-transaction-form/app-transaction-form.svelte';
	import Account from '#lib/web/components/app-ledger-table/account.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import Source from '#lib/web/components/app-ledger-table/source.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import ListViews from '#lib/web/components/app-list-views/app-list-views.svelte';
	import ListSearch from '#lib/web/components/app-list-search/app-list-search.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PagedTable from '#lib/web/components/app-ledger-table-paged/app-ledger-table-paged.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Chip from '#lib/web/components/ui-chip/ui-chip.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { formatBucket, formatDate, formatIsoDate } from '#lib/web/shared/format.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { paged } from '#lib/web/shared/paged.svelte.ts';
	import { goto } from '$app/navigation';
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

	const params = $derived([...page.url.searchParams]);
	const adding = $derived(page.url.searchParams.has('add'));
	const editing = $derived(page.url.searchParams.get('edit'));
	const files = $derived(adding ? await findTransactionFiles(handle) : null);
	const open = $derived(editing ? await findTransaction({ handle, id: editing }) : null);
	const closed = $derived(hrefWith(params, { add: '', edit: '' }));

	const periodLabel = $derived.by(() => {
		const p = filter.period;
		if (p.kind === 'month') return formatBucket.month(`${p.at}-01`);
		if (p.kind === 'year') return p.at;
		if (p.kind === 'custom') return `${formatDate(p.from)} – ${formatDate(p.to)}`;
		return 'All time';
	});

	const editHref = (id: string) => hrefWith(params, { add: '', edit: id });

	const refresh = async () => {
		await listTransactions({ handle, day, filter, after: null }).refresh();
		if (editing) await goto(closed);
	};
</script>

<PageHeader subtitle="Everything in your ledger, newest first">
	Transactions
	{#snippet actions()}
		{#if filter.period.kind !== 'all'}
			<Chip toggle on href={hrefWith(params, { at: '', range: '', from: '', to: '' })}>
				{periodLabel}
			</Chip>
		{/if}
		{#if filter.account}
			<Chip toggle on href={hrefWith(params, { account: '' })}>{filter.account}</Chip>
		{/if}
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
	<Panel title="Transactions" subtitle="newest first">
		<ListViews {handle} chosen="transactions"><ListSearch {filter} /></ListViews>

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
						<th
							scope="row"
							class="truncate"
							title={[transaction.description, transaction.comment].filter(Boolean).join('\n')}
						>
							{#if !transaction.counted}<Tag>evidence</Tag>{/if}
							<a href={editHref(transaction.id)}>{transaction.description}</a>
							{#if transaction.comment}<span class="comment">; {transaction.comment}</span>{/if}
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
	</Panel>

	{#if files?.data}
		<Aside title="Add transaction" onclose={() => goto(closed)}>
			<TransactionForm
				{handle}
				keys={files.data.keys}
				newest={files.data.newest}
				onsaved={refresh}
			/>
		</Aside>
	{:else if editing && open?.data}
		<Aside title="Edit transaction" onclose={() => goto(closed)}>
			{#key `${editing}:${open.data.version}`}
				<TransactionForm {handle} keys={[]} newest={null} edit={open.data} onsaved={refresh} />
			{/key}
		</Aside>
	{/if}
</PanelGrid>

<style>
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
