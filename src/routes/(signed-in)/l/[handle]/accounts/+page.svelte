<script lang="ts">
	import { getAccounts, getWorth } from '#lib/endpoints/accounts.remote.ts';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import LineChart from '#lib/web/components/line-chart/line-chart.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { formatAmount, formatDate } from '#lib/web/format.ts';
	import { ledgerCrumb } from '#lib/web/links.ts';
	import { changeOf, RANGES, rangeOf } from '#lib/web/worth.ts';
	import { page } from '$app/state';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const range = $derived(rangeOf(page.url.searchParams.get('range')));
	const response = $derived(await getAccounts(handle));
	const worth = $derived((await getWorth({ handle, range })).data ?? []);

	const cursor = $state({ index: null as number | null });

	const first = $derived(worth[0]);
	const last = $derived(worth[cursor.index ?? -1] ?? worth.at(-1));
	const change = $derived(first && last ? changeOf(first, last) : null);

	const lotsOf = (account: string, commodity: string) =>
		`/l/${handle}/accounts/lots?${new URLSearchParams({ account, commodity })}`;
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Accounts</PageHeader>

<Issues {handle} errors={response.errors} />

{#if first && last && change}
	<section aria-labelledby="worth" class="worth">
		<div class="summary">
			<div class="heading">
				<h2 id="worth" class="label">Net worth</h2>
				<nav aria-label="Range">
					{#each Object.entries(RANGES) as [key, name] (key)}
						<a href="?range={key}" class="label" aria-current={key === range ? 'page' : undefined}
							>{name}</a
						>
					{/each}
				</nav>
			</div>
			<p class="figure">{formatAmount(last.worth)}</p>
			<p>
				<span class={change.negative ? 'negative' : 'positive'}>
					{change.amount}{#if change.percent !== null}&nbsp;({change.percent}){/if}
				</span>
				{formatDate(first.day)} – {formatDate(last.day)}
				{#if last.unpriced > 0}<span class="nowrap">· excludes {last.unpriced} unpriced</span>{/if}
			</p>
		</div>
		<LineChart
			days={worth.map((w) => w.day)}
			lines={[
				{ label: 'Net worth', values: worth.map((w) => w.worth), kind: 'ink' },
				{ label: 'Assets', values: worth.map((w) => w.assets), kind: 'faint' },
				{ label: 'Owed', values: worth.map((w) => w.liabilities), kind: 'dashed' },
			]}
			onhover={(i: number | null) => (cursor.index = i)}
			label="Net worth from {formatDate(first.day)} to {formatDate(last.day)}, {formatAmount(
				first.worth,
			)} to {formatAmount(last.worth)}"
		/>
	</section>
{/if}

<LedgerTable
	columns={[
		{ label: 'Account' },
		{ label: 'Units', kind: 'amount', optional: true },
		{ label: 'Cost', kind: 'amount', optional: true },
		{ label: 'Price', kind: 'amount', optional: true },
		{ label: 'Value', kind: 'amount' },
		{ label: 'Gain', kind: 'amount' },
	]}
>
	{#each response.data ?? [] as account (account.account)}
		<tbody>
			<tr>
				<th scope="row" class="truncate">
					{account.account}
					{#if account.unpriced > 0}<span class="tag">{account.unpriced} unpriced</span>{/if}
				</th>
				<Amount value={null} optional />
				<Amount value={null} optional />
				<Amount value={null} optional />
				<Amount value={account.total} />
				<Amount value={null} />
			</tr>
			{#each account.holdings as holding (holding.commodity)}
				<tr class="child">
					<td>
						{#if holding.hasLots}
							<a href={lotsOf(account.account, holding.commodity)}>{holding.commodity}</a>
						{:else}
							{holding.commodity}
						{/if}
					</td>
					<Amount value={holding.units} optional />
					<Amount value={holding.cost} optional />
					<Amount value={holding.price} optional />
					<Amount value={holding.value}><span class="unpriced">unpriced</span></Amount>
					<Amount value={holding.gain} gain />
				</tr>
			{/each}
		</tbody>
	{/each}
</LedgerTable>

<style>
	.worth {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	.heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--size-2);
	}

	.heading nav {
		display: flex;
		gap: var(--size-2);
	}

	.heading a {
		text-decoration: none;
	}

	.heading a:hover {
		color: var(--color-ink);
	}

	.heading a[aria-current='page'] {
		color: var(--color-accent);
	}

	.summary p {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	.summary p.figure {
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: min(var(--font-size-display), 12vw);
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.nowrap {
		white-space: nowrap;
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}

	th .tag {
		margin: 0 0 0 var(--size-1);
	}

	.unpriced {
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
