<script lang="ts">
	import { listAccounts, listReturns } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/ledger.remote.ts';
	import { periodOf } from '#lib/shared/dates.ts';
	import { ASSETS, BalanceAccount } from '#lib/shared/accounts.ts';
	import { depthOf, isUnder } from '#lib/web/shared/accounts.ts';
	import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';
	import Bar from '#lib/web/components/ui-bar/ui-bar.svelte';
	import BarRow from '#lib/web/components/ui-bar-row/ui-bar-row.svelte';
	import ListFilter from '#lib/web/components/app-list-filter/app-list-filter.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import {
		formatAmount,
		formatIsoDate,
		formatPercent,
		formatReturn,
		formatWhole,
	} from '#lib/web/shared/format.ts';
	import { groupsInvested, investedOf, totalsOf } from '#lib/web/shared/invested.ts';
	import { page } from '$app/state';
	import * as v from 'valibot';

	type Holding = {
		commodity: string;
		hasLots: boolean;
		units: string | null;
		cost: string | null;
		price: string | null;
		value: string | null;
		gain: string | null;
	};

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const thisYear = { kind: 'year', at: day.slice(0, 4) } as const;
	const period = $derived(periodOf(page.url.searchParams, thisYear));
	const account = $derived(v.parse(BalanceAccount, page.url.searchParams.get('account')));
	const [response, earned, first] = $derived(
		await Promise.all([
			listAccounts({ handle, day, period }),
			listReturns({ handle, day, period }),
			findFirstDay(handle),
		]),
	);
	const earliest = $derived(first.data ?? null);
	const accounts = $derived(response.data ?? []);
	const returns = $derived(Object.fromEntries((earned.data ?? []).map((r) => [r.account, r])));
	const shown = $derived(accounts.filter((a) => isUnder(a.account, account)));
	const trees = $derived(
		Object.values(Object.groupBy(shown, (a) => a.account.split(':')[0] ?? '')),
	);

	const invested = $derived(investedOf(accounts, returns));
	const groups = $derived(groupsInvested(invested));
	const totals = $derived(totalsOf(groups));
	const byReturn = $derived(
		invested
			.map((a) => ({ ...a, grew: a.cost > 0 ? a.gain / a.cost : 0 }))
			.toSorted((a, b) => b.grew - a.grew),
	);
	const assets = $derived(
		accounts
			.filter((a) => a.parent === null && isUnder(a.account, ASSETS))
			.reduce((t, a) => t + Number(a.total), 0),
	);

	const lotsOf = (account: string, commodity: string) =>
		`/l/${handle}/accounts/lots?${new URLSearchParams({ account, commodity })}`;

	/** A commodity's row is named by it, so its units need no code after them. */
	const numberOf = (quantity: string | null) => quantity?.split(' ')[0] ?? null;

	/** A group adds up sub-accounts or several holdings; any other account reads as its one holding. */
	const isGroup = (account: { account: string; holdings: Holding[] }, next?: { account: string }) =>
		account.holdings.length > 1 || (next?.account.startsWith(`${account.account}:`) ?? false);
</script>

<PageHeader subtitle="What you own, and how it has grown">
	Accounts
	{#snippet actions()}
		<ListFilter {period} {account} {accounts} today={day} first={earliest} />
	{/snippet}
</PageHeader>

<Issues {handle} errors={[...(response.errors ?? []), ...(earned.errors ?? [])]} />

<KpiStrip>
	<Kpi
		label="Invested value"
		figure={formatWhole(String(totals.value))}
		detail="on {formatWhole(String(totals.cost))} put in"
	/>
	<Kpi
		label="Gain"
		figure={formatWhole(String(totals.gain))}
		detail="{formatReturn(String(totals.gain), String(totals.cost)) ?? '0%'} on cost"
		tone={totals.gain > 0 ? 'positive' : totals.gain < 0 ? 'negative' : undefined}
	/>
	<Kpi
		label="Return a year"
		figure={totals.xirr === null ? '0%' : formatPercent(totals.xirr)}
		detail="weighted by value across {groups.length} {groups.length === 1 ? 'account' : 'accounts'}"
	/>
	<Kpi
		label="Put in"
		figure={formatWhole(String(totals.netIn))}
		detail="across {groups.length} {groups.length === 1 ? 'account' : 'accounts'}"
	/>
</KpiStrip>

<Panel
	title="Value against cost"
	subtitle="what the investments are worth, and what went into them"
	soon
/>

<PanelGrid>
	<div class="column">
		<Panel title="Returns" subtitle="how much each account has grown on what went in">
			<ul role="list">
				{#each byReturn as a (a.account)}
					<BarRow
						name={a.name}
						detail="{a.xirr === null ? '' : `${formatPercent(a.xirr)} a year · `}gain {formatWhole(
							String(a.gain),
						)}"
						figure={formatReturn(String(a.gain), String(a.cost)) ?? '0%'}
						tone={a.gain > 0 ? 'positive' : a.gain < 0 ? 'negative' : undefined}
						share={a.grew / (byReturn[0]?.grew || 1)}
					/>
				{/each}
			</ul>
		</Panel>

		<Panel title="Biggest drops" subtitle="how far investments fell from their high" soon />
	</div>

	<Panel
		title="Return and risk"
		subtitle="each dot is an account, bigger dot, more money in it"
		soon
	/>
</PanelGrid>

{#snippet returnOf(gain: string | null, cost: string | null)}
	{@const negative = gain?.startsWith('-') ?? false}
	{@const percent = formatReturn(gain, cost)}
	<td class={['amount', { negative, positive: percent !== null && !negative }]}>{percent}</td>
{/snippet}

{#snippet flowed(account: string | null)}
	{@const r = account === null ? undefined : returns[account]}
	{@const negative = (r?.xirr ?? 0) < 0}
	<Amount value={r?.netIn ?? null} signed optional />
	<td
		class={['amount', { negative, positive: r?.xirr != null && !negative }]}
		title={r?.xirr == null ? undefined : r.yearly ? 'XIRR, per year' : 'Return over the period'}
	>
		{#if r?.xirr != null}{formatPercent(r.xirr)}{#if r.yearly}&nbsp;<span class="unit">p.a.</span
				>{/if}{/if}
	</td>
{/snippet}

{#snippet shareOf(value: string | null)}
	<td class="share optional"
		><Bar share={value === null || assets === 0 ? 0 : Number(value) / assets} /></td
	>
{/snippet}

{#snippet held(account: string, holding: Holding, child: boolean)}
	{#snippet label()}
		{#if child}
			<span class="name" style:--depth={depthOf(account) + 1}>{holding.commodity}</span>
		{:else}
			<AccountName {account} depth={depthOf(account)} full />
		{/if}
	{/snippet}
	<tr class={{ held: child }}>
		<td title={child ? undefined : account}>
			{#if holding.hasLots}
				<a href={lotsOf(account, holding.commodity)}>{@render label()}</a>
			{:else}
				{@render label()}
			{/if}
		</td>
		<Amount value={child ? numberOf(holding.units) : holding.units} units optional />
		<Amount value={holding.cost} optional />
		<Amount value={holding.value} note={holding.price && `@ ${formatAmount(holding.price, true)}`}
			><span class="unpriced">unpriced</span></Amount
		>
		<Amount value={holding.gain} signed />
		{@render returnOf(holding.gain, holding.cost)}
		{@render flowed(child ? null : account)}
		{@render shareOf(holding.value)}
	</tr>
{/snippet}

<Panel
	title="All accounts"
	subtitle="{trees.length} {trees.length === 1 ? 'group' : 'groups'} · {formatWhole(
		String(assets),
	)} in all"
>
	<LedgerTable
		columns={[
			{ label: 'Account' },
			{ label: 'Units', kind: 'amount', optional: true },
			{ label: 'Cost', kind: 'amount', optional: true },
			{ label: 'Value', kind: 'amount' },
			{ label: 'Gain', kind: 'amount' },
			{ label: 'Return', kind: 'amount' },
			{ label: 'Net in', kind: 'amount', optional: true },
			{ label: 'XIRR', kind: 'amount' },
			{ label: 'Share', optional: true },
		]}
	>
		{#each trees as tree (tree?.[0]?.account)}
			<tbody>
				{#each tree ?? [] as account, i (account.account)}
					{#if isGroup(account, tree?.[i + 1])}
						<tr class="group">
							<th scope="row" title={account.account}>
								<AccountName account={account.account} depth={depthOf(account.account)} full />
								{#if account.unpriced > 0}<Tag>{account.unpriced} unpriced</Tag>{/if}
							</th>
							<Amount value={null} optional />
							<Amount value={account.cost} optional />
							<Amount value={account.total} />
							<Amount value={account.gain} signed />
							{@render returnOf(account.gain, account.cost)}
							{@render flowed(account.account)}
							{@render shareOf(account.total)}
						</tr>
						{#each account.holdings as holding (holding.commodity)}
							{@render held(account.account, holding, true)}
						{/each}
					{:else}
						{#each account.holdings as holding (holding.commodity)}
							{@render held(account.account, holding, false)}
						{/each}
					{/if}
				{/each}
			</tbody>
		{/each}
	</LedgerTable>
</Panel>

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
		padding: 0;
	}

	tr.held > :global(:not(.amount)) {
		color: var(--color-muted);
	}

	.share {
		width: calc(var(--size-5) * 1.5);
	}

	.name {
		display: inline-block;
		padding-left: calc(var(--depth) * var(--size-2));
	}

	.unpriced,
	.unit {
		color: var(--color-muted);
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
