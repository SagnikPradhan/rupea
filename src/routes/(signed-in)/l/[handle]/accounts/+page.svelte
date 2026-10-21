<script lang="ts">
	import { getAccounts } from '#lib/endpoints/accounts.remote.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Account from '#lib/web/components/ledger-table/account.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import NetWorth from '#lib/web/components/net-worth/net-worth.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { formatIsoDate } from '#lib/web/format.ts';
	import { ledgerCrumb } from '#lib/web/links.ts';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const response = $derived(await getAccounts({ handle, day }));

	const lotsOf = (account: string, commodity: string) =>
		`/l/${handle}/accounts/lots?${new URLSearchParams({ account, commodity })}`;
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Accounts</PageHeader>

<Issues {handle} errors={response.errors} />

<NetWorth {handle} />

<LedgerTable
	columns={[
		{ label: 'Account' },
		{ label: 'Units', kind: 'amount', optional: true },
		{ label: 'Cost', kind: 'amount', optional: true },
		{ label: 'Price', kind: 'amount', optional: true },
		{ label: 'Value', kind: 'amount' },
	]}
>
	{#each response.data ?? [] as account (account.account)}
		<tbody>
			<tr>
				<th scope="row">
					<Account account={account.account} />
					{#if account.unpriced > 0}<span class="tag">{account.unpriced} unpriced</span>{/if}
				</th>
				<Amount value={null} optional />
				<Amount value={null} optional />
				<Amount value={null} optional />
				<Amount value={account.total} />
			</tr>
			{#each account.holdings as holding (holding.commodity)}
				<tr class="child">
					<td>
						{#if holding.hasLots}
							<a href={lotsOf(account.account, holding.commodity)} class="plain"
								>{holding.commodity}</a
							>
						{:else}
							{holding.commodity}
						{/if}
					</td>
					<Amount value={holding.units} optional />
					<Amount value={holding.cost} optional />
					<Amount value={holding.price} optional />
					<Amount value={holding.value} gain={holding.gain}
						><span class="unpriced">unpriced</span></Amount
					>
				</tr>
			{/each}
		</tbody>
	{/each}
</LedgerTable>

<style>
	.unpriced {
		color: var(--color-muted);
	}
</style>
