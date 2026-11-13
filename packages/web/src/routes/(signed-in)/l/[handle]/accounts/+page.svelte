<script lang="ts">
	import {
		listAccounts,
		listDrops,
		listInvested,
		listReturns,
	} from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/ledger.remote.ts';
	import { ASSETS } from '@rupea/shared/accounts.ts';
	import { isUnder } from '#lib/web/shared/accounts.ts';
	import AccountsTable from '#lib/web/components/app-accounts-table/app-accounts-table.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Drops from '#lib/web/components/app-drops/app-drops.svelte';
	import AssetsRings from '#lib/web/components/app-assets-rings/app-assets-rings.svelte';
	import InvestedKpis from '#lib/web/components/app-invested-kpis/app-invested-kpis.svelte';
	import InvestedReturns from '#lib/web/components/app-invested-returns/app-invested-returns.svelte';
	import InvestedRisk from '#lib/web/components/app-invested-risk/app-invested-risk.svelte';
	import Invested from '#lib/web/components/app-invested/app-invested.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { formatIsoDate } from '#lib/web/shared/format.ts';
	import { BalanceQuery, investedOf } from '#lib/web/shared/invested.ts';
	import { ringsOf } from '#lib/web/shared/rings.ts';
	import { readQuery } from '#lib/web/shared/query.svelte.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const url = readQuery(BalanceQuery(day));
	const [response, earned, first, owned, fallen] = $derived(
		await Promise.all([
			listAccounts({ handle, day, period: url.query.period }),
			listReturns({ handle, day, period: url.query.period }),
			findFirstDay(handle),
			listInvested({ handle, day, period: url.query.period, account: url.query.account }),
			listDrops({ handle, day, period: url.query.period, account: url.query.account }),
		]),
	);
	const accounts = $derived(response.data ?? []);
	const returns = $derived(Object.fromEntries((earned.data ?? []).map((r) => [r.account, r])));

	const invested = $derived(investedOf(accounts, returns));
	const rings = $derived(
		ringsOf(
			accounts,
			url.query.account !== null && isUnder(url.query.account, ASSETS) ? url.query.account : ASSETS,
		),
	);
</script>

<PageHeader subtitle="What you own, and how it has grown">
	Accounts
	{#snippet actions()}
		<ListFilter
			period={url.query.period}
			account={url.query.account}
			{accounts}
			today={day}
			first={first.data ?? null}
		/>
	{/snippet}
</PageHeader>

<Issues
	{handle}
	errors={[
		...(response.errors ?? []),
		...(earned.errors ?? []),
		...(owned.errors ?? []),
		...(fallen.errors ?? []),
	]}
/>

<PanelGrid narrow>
	<div>
		{#if (owned.data ?? []).length > 0}
			<Invested invested={owned.data ?? []} />
		{:else}
			<p>No investments with a cost in this period.</p>
		{/if}
	</div>

	<InvestedKpis {invested} />
</PanelGrid>

<PanelGrid>
	<div class="column">
		<InvestedReturns {invested} />

		<Panel title="Biggest drops" subtitle="how far investments fell from their high">
			{#if fallen.data?.[0]}
				<Drops drops={fallen.data[0]} />
			{:else}
				<p>Needs price history.</p>
			{/if}
		</Panel>
	</div>

	<div class="column">
		<AssetsRings {rings} account={url.query.account} />

		<InvestedRisk {invested} swings={fallen.data?.[0]?.swings ?? []} arcs={rings.arcs} />
	</div>
</PanelGrid>

<AccountsTable {accounts} {returns} under={url.query.account} {handle} />

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}
</style>
