<script lang="ts">
	import { listSpending } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/transactions.remote.ts';
	import { periodOf } from '#lib/shared/dates.ts';
	import { depthOf, nameOf, prefixOf } from '#lib/web/shared/accounts.ts';
	import { Scale } from '#lib/web/shared/chart.ts';
	import BarChart from '#lib/web/components/bar-chart/bar-chart.svelte';
	import Calendar from '#lib/web/components/calendar/calendar.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import PeriodPicker from '#lib/web/components/period-picker/period-picker.svelte';
	import ScalePicker from '#lib/web/components/scale-picker/scale-picker.svelte';
	import Swatch from '#lib/web/components/swatch/swatch.svelte';
	import {
		formatAmount,
		formatBucket,
		formatChange,
		formatDate,
		formatExact,
		formatIsoDate,
		formatShare,
	} from '#lib/web/shared/format.ts';
	import { ledgerCrumb } from '#lib/web/shared/links.ts';
	import {
		barsOf,
		monthsIn,
		OTHER,
		partsOf,
		PREVIOUS,
		ROOT,
		totalOf,
		wholeOf,
	} from '#lib/web/shared/spending.ts';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const period = $derived(periodOf(page.url.searchParams, day));
	const scale = $derived(v.parse(v.fallback(Scale, 'linear'), page.url.searchParams.get('scale')));

	const response = $derived(await listSpending({ handle, day, period }));
	const spending = $derived(response.data?.[0]);
	const previous = $derived(response.data?.[1]);
	const bucket = $derived(spending?.bucket ?? 'month');
	const earliest = $derived((await findFirstDay(handle)).data ?? null);

	const total = $derived(spending?.totals.find((t) => t.account === ROOT));
	const parts = $derived(partsOf(spending));
	const bars = $derived(barsOf({ spending, previous, parts }));
	const whole = $derived(wholeOf({ spending, previous, parts }));
	const other = $derived([whole, ...bars].some((b) => b[OTHER] !== '0'));

	const first = $derived(spending?.from ?? day);
	const last = $derived(spending?.to ?? day);
	const label = $derived(
		`Spending from ${formatDate(first)} to ${formatDate(last)}, ${formatAmount(total?.amount ?? '0')} in all`,
	);
	const months = $derived(monthsIn(first, last));

	const postingsOf = (account: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account, ...(period.kind === 'all' ? { range: 'all' } : { from: first, to: last }) })}`;
	const postingsOn = (day: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account: ROOT, from: day, to: day })}`;
	const perMonth = (amount: string) => (Number(amount) / months).toFixed(2);
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Expenses</PageHeader>

<Issues {handle} errors={response.errors} />

<section aria-labelledby="spending">
	{#if bucket === 'day'}
		<Calendar rows={bars} x="bucket" y="total" href={postingsOn} {label} {summary} />
	{:else}
		<BarChart
			rows={bars}
			x="bucket"
			{bucket}
			series={[
				...parts.map((p) => ({ key: p, label: nameOf(p), role: 'part' as const })),
				...(other ? [{ key: OTHER, label: OTHER, role: 'part' as const }] : []),
				...(previous ? [{ key: PREVIOUS, label: PREVIOUS, role: 'reference' as const }] : []),
			]}
			{whole}
			{label}
			{scale}
			{summary}
		>
			{#snippet controls()}<ScalePicker current={scale} />{/snippet}
		</BarChart>
	{/if}
</section>

{#snippet summary(index: number | null)}
	{@const bar = index === null ? undefined : bars[index]}
	{@const shown = bar?.total ?? total?.amount ?? '0'}
	{@const compared = bar ? bar[PREVIOUS] : totalOf(previous)}
	{@const change = compared ? formatChange(compared, shown) : null}
	<div class="summary">
		<h2 id="spending" class="label">Spending</h2>
		<PeriodPicker current={period} shown={{ from: first, to: last }} today={day} first={earliest} />
		<p class="figure" title={formatExact(shown)}>{formatAmount(shown)}</p>
		<p>
			{#if change}
				<span class="nowrap">
					{change.amount}{#if change.percent !== null}&nbsp;({change.percent}){/if} vs previous ·
				</span>
			{/if}
			{bar ? formatBucket[bucket](bar.bucket) : `${formatDate(first)} – ${formatDate(last)}`}
			{#if total && total.unpriced > 0}
				<span class="nowrap">· excludes {total.unpriced} unpriced</span>
			{/if}
		</p>
	</div>
{/snippet}

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
						{#if parts.includes(account.account)}<Swatch
								part={parts.indexOf(account.account)}
							/>{/if}
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
	<p>Nothing spent in this period.</p>
{/if}

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		margin-bottom: var(--size-2);
	}

	h2 {
		margin: 0;
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
