<script lang="ts">
	import { type Amount as Money, printAmount, sum, toNumber, ASSETS } from '@rupea/shared/money.ts';
	import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Bar from '#lib/web/components/ui-bar/ui-bar.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { depthOf, isUnder } from '#lib/web/shared/accounts.ts';
	import {
		formatAmount,
		formatPercent,
		formatReturn,
		formatWhole,
		toneOf,
	} from '#lib/web/shared/format.ts';
	import { lotsHref } from '#lib/web/shared/links.ts';

	type Holding = {
		commodity: string;
		hasLots: boolean;
		units: string | null;
		cost: string | null;
		price: string | null;
		value: string | null;
		gain: string | null;
	};

	type Row = {
		account: string;
		parent: string | null;
		total: Money;
		cost: Money | null;
		gain: Money | null;
		unpriced: number;
		holdings: Holding[];
	};

	type Returned = { netIn: string | null; xirr: number | null; yearly: boolean };

	type Props = {
		accounts: Row[];
		returns: Record<string, Returned | undefined>;
		under: string | null;
		handle: string;
	};

	const { accounts, returns, under, handle }: Props = $props();

	const assets = $derived(
		sum(
			accounts.filter((a) => a.parent === null && isUnder(a.account, ASSETS)).map((a) => a.total),
		),
	);
	const trees = $derived(
		Object.values(
			Object.groupBy(
				accounts.filter((a) => isUnder(a.account, under)),
				(a) => a.account.split(':')[0] ?? '',
			),
		),
	);

	/** A commodity's row is named by it, so its units need no code after them. */
	const numberOf = (quantity: string | null) => quantity?.split(' ')[0] ?? null;

	/**
	 * A group adds up sub-accounts or several holdings; any other account reads
	 * as its one holding.
	 */
	const isGroup = (node: { account: string; holdings: Holding[] }, next?: { account: string }) =>
		node.holdings.length > 1 || (next?.account.startsWith(`${node.account}:`) ?? false);
</script>

{#snippet returnOf(gain: string | null, cost: string | null)}
	{@const percent = formatReturn(gain, cost)}
	{@const tone = percent === null ? undefined : toneOf(Number(gain))}
	<td class={['amount', tone]}>{percent}</td>
{/snippet}

{#snippet flowed(account: string | null)}
	{@const r = account === null ? undefined : returns[account]}
	{@const tone = toneOf(r?.xirr ?? 0)}
	<Amount value={r?.netIn ?? null} signed optional />
	<td
		class={['amount', tone]}
		title={r?.xirr == null ? undefined : r.yearly ? 'XIRR, per year' : 'Return over the period'}
	>
		{#if r?.xirr != null}{formatPercent(r.xirr)}{#if r.yearly}&nbsp;<span class="unit">p.a.</span
				>{/if}{/if}
	</td>
{/snippet}

{#snippet shareOf(value: string | null)}
	<td class="share optional"
		><Bar share={value === null || assets === 0n ? 0 : Number(value) / toNumber(assets)} /></td
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
				<a href={lotsHref(handle, { account, commodity: holding.commodity })}>{@render label()}</a>
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
		printAmount(assets),
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
							<Amount value={printAmount(account.cost)} optional />
							<Amount value={printAmount(account.total)} />
							<Amount value={printAmount(account.gain)} signed />
							{@render returnOf(printAmount(account.gain), printAmount(account.cost))}
							{@render flowed(account.account)}
							{@render shareOf(printAmount(account.total))}
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
