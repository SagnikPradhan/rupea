<script lang="ts">
	import { listLots } from '#lib/endpoints/accounts.remote.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Source from '#lib/web/components/app-ledger-table/source.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { formatAmount, formatDate, formatExact } from '#lib/web/shared/format.ts';
	import { fileHref } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const account = $derived(page.url.searchParams.get('account') ?? '');
	const commodity = $derived(page.url.searchParams.get('commodity') ?? '');
	const response = $derived(await listLots({ handle, account, commodity }));
</script>

<PageHeader>{commodity} in {account}</PageHeader>

<Issues {handle} errors={response.errors} />

{#if response.data?.length === 0}
	<p>No lots of {commodity} in {account}.</p>
{:else}
	<LedgerTable
		columns={[
			{ label: 'Date', kind: 'date' },
			{ label: 'Lot' },
			{ label: 'Units', kind: 'amount' },
			{ label: 'Price', kind: 'amount', optional: true },
			{ label: 'Gain', kind: 'amount' },
		]}
	>
		{#each response.data ?? [] as lot (`${lot.file}:${lot.line}`)}
			<tbody>
				<tr>
					<td class="date">{formatDate(lot.date)}</td>
					<th scope="row" class="truncate">
						{lot.origin}{lot.from ? ` from ${lot.from}` : ''}
						<Tag title={formatExact(lot.remaining, formatAmount(lot.remaining, true))}
							>{formatAmount(lot.remaining, true)} left</Tag
						>
					</th>
					<Amount value={lot.units} units />
					<Amount value={lot.cost} optional />
					<Source {handle} file={lot.file} line={lot.line} />
				</tr>
				{#each lot.disposals as disposal, i (i)}
					<tr class="child">
						<td class="date">{formatDate(disposal.date)}</td>
						<td>
							<a href={fileHref(handle, disposal.file, disposal.line)}>{disposal.kind}</a>
						</td>
						<Amount value={disposal.units} units />
						<Amount value={disposal.price} units optional />
						<Amount value={disposal.gain} signed />
					</tr>
				{/each}
			</tbody>
		{/each}
	</LedgerTable>
{/if}

<style>
	th::first-letter {
		text-transform: uppercase;
	}

	p {
		color: var(--color-muted);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
