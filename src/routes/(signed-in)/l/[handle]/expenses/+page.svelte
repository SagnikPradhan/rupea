<script lang="ts">
	import { listSpending } from '#lib/endpoints/accounts.remote.ts';
	import { BUCKETS, Range } from '#lib/shared/dates.ts';
	import BarChart from '#lib/web/components/bar-chart/bar-chart.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import RangePicker from '#lib/web/components/range-picker/range-picker.svelte';
	import {
		formatAmount,
		formatBucket,
		formatDate,
		formatExact,
		formatIsoDate,
		formatShare,
	} from '#lib/web/format.ts';
	import { ledgerCrumb } from '#lib/web/links.ts';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const ROOT = 'Expenses';
	/** An average month, so a year's spending divides into twelve of them. */
	const MONTH_DAYS = 365.25 / 12;
	const DAY_MS = 24 * 60 * 60 * 1000;

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const range = $derived(v.parse(v.fallback(Range, 'ytd'), page.url.searchParams.get('range')));
	const bucket = $derived(BUCKETS[range]);

	const response = $derived(await listSpending({ handle, range, day }));
	const spending = $derived(response.data?.[0]);
	const total = $derived(spending?.totals.find((t) => t.account === ROOT));
	const bars = $derived.by(() => {
		const spent = Object.fromEntries(
			(spending?.spent ?? []).filter((s) => s.account === ROOT).map((s) => [s.bucket, s.amount]),
		);
		return (spending?.buckets ?? []).map((b) => ({ bucket: b, spent: spent[b] ?? '0' }));
	});
	const first = $derived(bars[0]?.bucket ?? day);
	const months = $derived(((Date.parse(day) - Date.parse(first)) / DAY_MS + 1) / MONTH_DAYS);

	const postingsOf = (account: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account, range })}`;
	const perMonth = (amount: string) => (Number(amount) / months).toFixed(2);

	const depthOf = (account: string) => account.split(':').length - 1;
	const nameOf = (account: string) => account.split(':').at(-1) ?? account;
	/** The first letter of each parent, like E:F: for Expenses:Food:Groceries. */
	const prefixOf = (account: string) =>
		account
			.split(':')
			.slice(0, -1)
			.map((part) => `${part[0]}:`)
			.join('');
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Expenses</PageHeader>

<Issues {handle} errors={response.errors} />

<section aria-labelledby="spending">
	<BarChart
		rows={bars}
		x="bucket"
		{bucket}
		series={[{ key: 'spent', label: 'Spending', role: 'primary' }]}
		label="Spending from {formatDate(first)} to {formatDate(day)}, {formatAmount(
			total?.amount ?? '0',
		)} in all"
	>
		{#snippet summary(index: number | null)}
			{@const bar = index === null ? undefined : bars[index]}
			{@const shown = bar?.spent ?? total?.amount ?? '0'}
			<div class="summary">
				<div class="heading">
					<h2 id="spending" class="label">Spending</h2>
					<RangePicker current={range} />
				</div>
				<p class="figure" title={formatExact(shown)}>{formatAmount(shown)}</p>
				<p>
					{bar ? formatBucket[bucket](bar.bucket) : `${formatDate(first)} – ${formatDate(day)}`}
					{#if total && total.unpriced > 0}
						<span class="nowrap">· excludes {total.unpriced} unpriced</span>
					{/if}
				</p>
			</div>
		{/snippet}
	</BarChart>
</section>

{#if spending && spending.totals.length > 0}
	<LedgerTable
		columns={[
			{ label: 'Account' },
			{ label: 'Spent', kind: 'amount' },
			{ label: 'Share', kind: 'amount' },
			...(bucket === 'day'
				? []
				: [{ label: 'Per month', kind: 'amount' as const, optional: true }]),
		]}
	>
		<tbody>
			{#each spending.totals as account (account.account)}
				<tr>
					<th scope="row" class={{ nested: depthOf(account.account) > 0 }}>
						<a
							href={postingsOf(account.account)}
							class="name plain"
							style:--depth={depthOf(account.account)}
							title={account.account}
							><span class="prefix">{prefixOf(account.account)}</span>{nameOf(account.account)}</a
						>
						{#if account.unpriced > 0}<span class="tag">{account.unpriced} unpriced</span>{/if}
					</th>
					<Amount value={account.amount} />
					<td class="amount share">
						{#if account.account !== ROOT}{formatShare(account.amount, total?.amount ?? '0')}{/if}
					</td>
					{#if bucket !== 'day'}
						<Amount value={perMonth(account.amount)} compact optional />
					{/if}
				</tr>
			{/each}
		</tbody>
	</LedgerTable>
{:else}
	<p>Nothing spent in this range.</p>
{/if}

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin-bottom: var(--size-2);
	}

	.heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--size-2);
	}

	p {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	p.figure {
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

	th.nested,
	th.nested ~ :global(td.amount) {
		font-size: var(--font-size-1);
	}

	.name {
		display: inline-block;
		padding-left: calc(var(--depth) * var(--size-2));
	}

	.prefix,
	.share {
		color: var(--color-muted);
	}
</style>
