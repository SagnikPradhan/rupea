<script lang="ts">
	import { listAccounts, listDeltas } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/ledger.remote.ts';
	import { paramsOf, periodOf } from '#lib/shared/dates.ts';
	import { BalanceAccount, LIABILITIES } from '#lib/shared/accounts.ts';
	import { depthOf, isUnder, nameOf } from '#lib/web/shared/accounts.ts';
	import { formatIsoDate, formatWhole } from '#lib/web/shared/format.ts';
	import { linesOf, owedOf, rowsOf } from '#lib/web/shared/liabilities.ts';
	import { ringsOf } from '#lib/web/shared/rings.ts';
	import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Donut from '#lib/web/components/ui-chart-donut/ui-chart-donut.svelte';
	import Timeline from '#lib/web/components/ui-chart-timeline/ui-chart-timeline.svelte';
	import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const SETTLED = { '': 'Open only', yes: 'Including settled' };

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const thisYear = { kind: 'year', at: day.slice(0, 4) } as const;
	const period = $derived(periodOf(page.url.searchParams, thisYear));
	const picked = $derived(v.parse(BalanceAccount, page.url.searchParams.get('account')));
	const account = $derived(picked !== null && isUnder(picked, LIABILITIES) ? picked : null);
	const settled = $derived(page.url.searchParams.get('settled') === 'yes');

	const [response, flowed, first] = $derived(
		await Promise.all([
			listAccounts({ handle, day, period }),
			listDeltas({ handle, day, period, account: LIABILITIES }),
			findFirstDay(handle),
		]),
	);
	const moved = $derived(flowed.data?.[0]);
	const owed = $derived(owedOf(response.data ?? []));
	const shown = $derived(owed.filter((a) => isUnder(a.account, account)));
	const rows = $derived(rowsOf(shown, moved?.totals ?? [], settled));
	const lines = $derived(
		linesOf(
			(moved?.deltas ?? []).filter((d) => isUnder(d.account, account)),
			owed,
		).map((l) => ({ ...l, key: l.account, label: nameOf(l.account) })),
	);
	const total = $derived(shown.find((a) => a.account === (account ?? LIABILITIES))?.total ?? '0');
	const rings = $derived(ringsOf(owed, account ?? LIABILITIES));
	const credit = $derived(
		rings.skipped === 0
			? undefined
			: `${rings.skipped} ${rings.skipped === 1 ? 'account is' : 'accounts are'} in credit, so not drawn`,
	);

	const postingsOf = (a: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account: a, ...paramsOf(period) })}`;
</script>

<PageHeader subtitle="What you owe, what is due, and when it ends">
	Liabilities
	{#snippet actions()}
		<ListFilter
			{period}
			{account}
			accounts={owed}
			today={day}
			first={first.data ?? null}
			moreParams={['settled']}
		>
			{#snippet more()}
				<FilterSection label="Accounts">
					<ChoiceChips
						param="settled"
						label="Settled accounts"
						choices={SETTLED}
						current={settled ? 'yes' : ''}
					/>
				</FilterSection>
			{/snippet}
		</ListFilter>
	{/snippet}
</PageHeader>

<Issues {handle} errors={[...(response.errors ?? []), ...(flowed.errors ?? [])]} />

<PanelGrid narrow>
	<div>
		{#if lines.length > 0 && moved}
			<Timeline
				{lines}
				buckets={moved.buckets}
				bucket={moved.bucket}
				label="What was paid down on each loan and card, over the period"
			/>
		{:else}
			<p>Nothing paid down in this period.</p>
		{/if}
	</div>
	<KpiStrip>
		<Kpi label="Due in 30 days" soon />
		<Kpi label="Interest a month" soon />
		<Kpi label="Card limit used" soon />
		<Kpi label="Debt-free by" soon />
	</KpiStrip>
</PanelGrid>

<PanelGrid>
	<Panel title="What you owe" subtitle="owed by loan and card, the inner ring the groups">
		{#if rings.arcs.length > 0}
			<Donut
				arcs={rings.arcs}
				levels={rings.levels}
				label="How what is owed divides across its accounts"
				note={credit}
			/>
		{:else}
			<p>Nothing owed.</p>
		{/if}
	</Panel>
	<div class="column">
		<Panel
			title="When each loan ends"
			subtitle="how much of each loan is paid, and the year it ends"
			soon
		/>
		<Panel title="Card limits" subtitle="used out of each card’s limit" soon />
	</div>
</PanelGrid>

<PanelGrid>
	<Panel title="Card balance" subtitle="the average balance of the cards, by month" soon />
	<Panel
		title="All liabilities"
		subtitle="{rows.length} {rows.length === 1 ? 'account' : 'accounts'} · {formatWhole(
			total,
		)} owed"
	>
		{#if rows.length > 0}
			<LedgerTable
				columns={[
					{ label: 'Account' },
					{ label: 'Owed', kind: 'amount' },
					{ label: 'Paid down', kind: 'amount' },
				]}
			>
				<tbody>
					{#each rows as row (row.account)}
						<tr>
							<th scope="row">
								<a href={postingsOf(row.account)} title={row.account}
									><AccountName account={row.account} depth={depthOf(row.account) - 1} /></a
								>
								{#if row.unpriced > 0}<Tag>{row.unpriced} unpriced</Tag>{/if}
							</th>
							<Amount value={row.owed} />
							<Amount value={row.paid} signed />
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr>
						<th scope="row">Total</th>
						<Amount value={total} />
						<Amount value={null} />
					</tr>
				</tfoot>
			</LedgerTable>
		{:else}
			<p>Nothing owed.</p>
		{/if}
	</Panel>
</PanelGrid>

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
