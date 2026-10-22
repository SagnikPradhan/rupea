<script lang="ts">
	import { listLots } from '#lib/endpoints/accounts.remote.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import Source from '#lib/web/components/ledger-table/source.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { formatAmount, formatDate, formatExact } from '#lib/web/format.ts';
	import { fileHref, ledgerCrumb } from '#lib/web/links.ts';
	import { page } from '$app/state';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const account = $derived(page.url.searchParams.get('account') ?? '');
	const commodity = $derived(page.url.searchParams.get('commodity') ?? '');
	const response = $derived(await listLots({ handle, account, commodity }));

	const trail = $derived([
		ledgerCrumb(data.ledger),
		{ href: `/l/${handle}/accounts`, label: 'Accounts' },
	]);
</script>

<PageHeader {trail}>{commodity} in {account}</PageHeader>

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
						<span class="tag" title={formatExact(lot.remaining, formatAmount(lot.remaining, true))}
							>{formatAmount(lot.remaining, true)} left</span
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
							<a href={fileHref(handle, disposal.file, disposal.line)} class="plain"
								>{disposal.kind}</a
							>
						</td>
						<Amount value={disposal.units} units />
						<Amount value={disposal.price} optional />
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
</style>
