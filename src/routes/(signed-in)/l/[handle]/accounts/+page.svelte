<script lang="ts">
	import { getAccounts } from '#lib/endpoints/accounts.remote.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import NetWorth from '#lib/web/components/net-worth/net-worth.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { formatAmount, formatIsoDate, formatReturn } from '#lib/web/format.ts';
	import { ledgerCrumb } from '#lib/web/links.ts';

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
	const response = $derived(await getAccounts({ handle, day }));
	const trees = $derived(
		Object.values(Object.groupBy(response.data ?? [], (a) => a.account.split(':')[0] ?? '')),
	);

	const lotsOf = (account: string, commodity: string) =>
		`/l/${handle}/accounts/lots?${new URLSearchParams({ account, commodity })}`;

	const depthOf = (account: string) => account.split(':').length - 1;
	const nameOf = (account: string) => account.split(':').at(-1) ?? account;

	/** A group adds up sub-accounts or several holdings; any other account reads as its one holding. */
	const isGroup = (account: { account: string; holdings: Holding[] }, next?: { account: string }) =>
		account.holdings.length > 1 || (next?.account.startsWith(`${account.account}:`) ?? false);
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Accounts</PageHeader>

<Issues {handle} errors={response.errors} />

<NetWorth {handle} />

{#snippet returnOf(gain: string | null, cost: string | null)}
	{@const negative = gain?.startsWith('-') ?? false}
	{@const percent = formatReturn(gain, cost)}
	<td class={['amount', { negative, positive: percent !== null && !negative }]}>{percent}</td>
{/snippet}

{#snippet held(account: string, holding: Holding, child: boolean)}
	{@const name = child ? holding.commodity : nameOf(account)}
	<tr class={{ child }}>
		<td>
			<span class="name" style:--depth={depthOf(account) + Number(child)}>
				{#if holding.hasLots}
					<a href={lotsOf(account, holding.commodity)} class="plain">{name}</a>
				{:else}
					{name}
				{/if}
			</span>
		</td>
		<Amount value={holding.units} units optional />
		<Amount value={holding.cost} optional />
		<Amount value={holding.value} note={holding.price && `@ ${formatAmount(holding.price)}`}
			><span class="unpriced">unpriced</span></Amount
		>
		<Amount value={holding.gain} signed />
		{@render returnOf(holding.gain, holding.cost)}
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
	]}
>
	{#each trees as tree (tree?.[0]?.account)}
		<tbody>
			{#each tree ?? [] as account, i (account.account)}
				{#if isGroup(account, tree?.[i + 1])}
					<tr class="group">
						<th scope="row" class={{ nested: depthOf(account.account) > 0 }}>
							<span class="name" style:--depth={depthOf(account.account)}
								>{nameOf(account.account)}</span
							>
							{#if account.unpriced > 0}<span class="tag">{account.unpriced} unpriced</span>{/if}
						</th>
						<Amount value={null} optional />
						<Amount value={account.cost} optional />
						<Amount value={account.total} />
						<Amount value={account.gain} signed />
						{@render returnOf(account.gain, account.cost)}
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

	.name {
		display: inline-block;
		padding-left: calc(var(--depth) * var(--size-2));
	}

	.unpriced {
		color: var(--color-muted);
	}
</style>
