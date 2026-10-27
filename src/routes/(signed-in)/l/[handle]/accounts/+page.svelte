<script lang="ts">
	import { listAccounts, listReturns, listWorth } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/ledger.remote.ts';
	import { periodOf } from '#lib/shared/dates.ts';
	import { BalanceAccount } from '#lib/shared/accounts.ts';
	import { depthOf, isUnder, nameOf, prefixOf } from '#lib/web/shared/accounts.ts';
	import AccountPicker from '#lib/web/components/account-picker/account-picker.svelte';
	import ChoicePicker from '#lib/web/components/choice-picker/choice-picker.svelte';
	import FilterRail from '#lib/web/components/filter-rail/filter-rail.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import NetWorth from '#lib/web/components/net-worth/net-worth.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import PeriodPicker from '#lib/web/components/period-picker/period-picker.svelte';
	import {
		formatAmount,
		formatIsoDate,
		formatPercent,
		formatReturn,
	} from '#lib/web/shared/format.ts';
	import { WorthChart, WORTH_CHART_LABELS } from '#lib/web/shared/choices.ts';
	import { ledgerCrumb } from '#lib/web/shared/links.ts';
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
	const period = $derived(periodOf(page.url.searchParams, { kind: 'year', at: day.slice(0, 4) }));
	const account = $derived(v.parse(BalanceAccount, page.url.searchParams.get('account')));
	const chart = $derived(
		v.parse(v.fallback(WorthChart, 'time'), page.url.searchParams.get('chart')),
	);
	const response = $derived(await listAccounts({ handle, day, period }));
	const worth = $derived((await listWorth({ handle, day, period, account })).data ?? []);
	const earned = $derived(await listReturns({ handle, day, period }));
	const earliest = $derived((await findFirstDay(handle)).data ?? null);
	const accounts = $derived(response.data ?? []);
	const returns = $derived(Object.fromEntries((earned.data ?? []).map((r) => [r.account, r])));
	const shown = $derived(accounts.filter((a) => isUnder(a.account, account)));
	const trees = $derived(
		Object.values(Object.groupBy(shown, (a) => a.account.split(':')[0] ?? '')),
	);

	const lotsOf = (account: string, commodity: string) =>
		`/l/${handle}/accounts/lots?${new URLSearchParams({ account, commodity })}`;

	/** A commodity's row is named by it, so its units need no code after them. */
	const numberOf = (quantity: string | null) => quantity?.split(' ')[0] ?? null;

	/** A group adds up sub-accounts or several holdings; any other account reads as its one holding. */
	const isGroup = (account: { account: string; holdings: Holding[] }, next?: { account: string }) =>
		account.holdings.length > 1 || (next?.account.startsWith(`${account.account}:`) ?? false);
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Accounts</PageHeader>

<FilterRail>
	{#snippet filters()}
		<PeriodPicker
			current={period}
			shown={{ from: worth[0]?.day ?? day, to: worth.at(-1)?.day ?? day }}
			today={day}
			first={earliest}
		/>
		<AccountPicker current={account} {accounts} top={null} />
	{/snippet}

	<Issues {handle} errors={[...(response.errors ?? []), ...(earned.errors ?? [])]} />

	<NetWorth {worth} {accounts} {account} {chart}>
		{#snippet controls()}
			<ChoicePicker param="chart" label="Chart" choices={WORTH_CHART_LABELS} current={chart} />
		{/snippet}
	</NetWorth>

	{#snippet returnOf(gain: string | null, cost: string | null)}
		{@const negative = gain?.startsWith('-') ?? false}
		{@const percent = formatReturn(gain, cost)}
		<td class={['amount', { negative, positive: percent !== null && !negative }]}>{percent}</td>
	{/snippet}

	{#snippet flowed(account: string | null)}
		{@const r = account === null ? undefined : returns[account]}
		{@const negative = (r?.xirr ?? 0) < 0}
		<Amount value={r?.netIn ?? null} signed compact optional />
		<td
			class={['amount', { negative, positive: r?.xirr != null && !negative }]}
			title={r?.xirr == null ? undefined : r.yearly ? 'XIRR, per year' : 'Return over the period'}
		>
			{#if r?.xirr != null}{formatPercent(r.xirr)}{#if r.yearly}&nbsp;<span class="unit">p.a.</span
					>{/if}{/if}
		</td>
	{/snippet}

	{#snippet held(account: string, holding: Holding, child: boolean)}
		{@const name = child ? holding.commodity : nameOf(account)}
		<tr class={{ child, leaf: !child }}>
			<td>
				<span
					class="name"
					style:--depth={depthOf(account) + Number(child)}
					title={child ? undefined : account}
				>
					{#if !child}<span class="prefix">{prefixOf(account)}</span>{/if}{#if holding.hasLots}
						<a href={lotsOf(account, holding.commodity)} class="plain">{name}</a>
					{:else}
						{name}
					{/if}
				</span>
			</td>
			<Amount value={child ? numberOf(holding.units) : holding.units} compact optional />
			<Amount value={holding.cost} compact optional />
			<Amount value={holding.value} note={holding.price && `@ ${formatAmount(holding.price)}`}
				><span class="unpriced">unpriced</span></Amount
			>
			<Amount value={holding.gain} signed compact />
			{@render returnOf(holding.gain, holding.cost)}
			{@render flowed(child ? null : account)}
		</tr>
	{/snippet}

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
		]}
	>
		{#each trees as tree (tree?.[0]?.account)}
			<tbody>
				{#each tree ?? [] as account, i (account.account)}
					{#if isGroup(account, tree?.[i + 1])}
						<tr class="group">
							<th scope="row" class={{ nested: depthOf(account.account) > 0 }}>
								<span class="name" style:--depth={depthOf(account.account)} title={account.account}
									><span class="prefix">{prefixOf(account.account)}</span>{nameOf(
										account.account,
									)}</span
								>
								{#if account.unpriced > 0}<span class="tag">{account.unpriced} unpriced</span>{/if}
							</th>
							<Amount value={null} optional />
							<Amount value={account.cost} compact optional />
							<Amount value={account.total} />
							<Amount value={account.gain} signed compact />
							{@render returnOf(account.gain, account.cost)}
							{@render flowed(account.account)}
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
</FilterRail>

<style>
	tbody + tbody {
		border-top: 1px solid var(--color-border);
	}

	tr.group:not(:first-child) > :global(*) {
		padding-top: var(--size-1);
	}

	tr.group > th.nested,
	tr.group > th ~ :global(td.amount) {
		font-size: var(--font-size-1);
	}

	tr.leaf > :global(*) {
		padding-top: var(--size-0);
	}

	.name {
		display: inline-block;
		padding-left: calc(var(--depth) * var(--size-2));
	}

	tr.leaf .name,
	th.nested .name {
		font-size: var(--font-size-2);
	}

	.prefix {
		color: var(--color-muted);
	}

	.unpriced,
	.unit {
		color: var(--color-muted);
	}
</style>
