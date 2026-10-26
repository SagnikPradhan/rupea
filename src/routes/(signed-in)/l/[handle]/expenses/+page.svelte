<script lang="ts">
	import { listSpending } from '#lib/endpoints/accounts.remote.ts';
	import { findFirstDay } from '#lib/endpoints/transactions.remote.ts';
	import { periodOf } from '#lib/shared/dates.ts';
	import { ExpenseAccount, EXPENSES } from '#lib/shared/filter.ts';
	import { depthOf, nameOf, prefixOf } from '#lib/web/shared/accounts.ts';
	import { seriesOf } from '#lib/web/shared/chart.ts';
	import { Chart, CHART_LABELS, Scale, SCALE_LABELS } from '#lib/web/shared/choices.ts';
	import AlluvialChart from '#lib/web/components/alluvial-chart/alluvial-chart.svelte';
	import AccountPicker from '#lib/web/components/account-picker/account-picker.svelte';
	import BarChart from '#lib/web/components/bar-chart/bar-chart.svelte';
	import Calendar from '#lib/web/components/calendar/calendar.svelte';
	import ChoicePicker from '#lib/web/components/choice-picker/choice-picker.svelte';
	import FilterRail from '#lib/web/components/filter-rail/filter-rail.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import PeriodPicker from '#lib/web/components/period-picker/period-picker.svelte';
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
		rowsOf,
		totalOf,
		wholeOf,
	} from '#lib/web/shared/spending.ts';
	import { page } from '$app/state';
	import * as v from 'valibot';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const period = $derived(periodOf(page.url.searchParams, day));
	const account = $derived(v.parse(ExpenseAccount, page.url.searchParams.get('account')));
	const scale = $derived(v.parse(v.fallback(Scale, 'linear'), page.url.searchParams.get('scale')));
	const chart = $derived(v.parse(v.fallback(Chart, 'time'), page.url.searchParams.get('chart')));

	const response = $derived(await listSpending({ handle, day, period, account }));
	const spending = $derived(response.data?.[0]);
	const previous = $derived(response.data?.[1]);
	const bucket = $derived(spending?.bucket ?? 'month');
	const earliest = $derived((await findFirstDay(handle)).data ?? null);

	const rows = $derived(rowsOf(spending?.totals ?? [], account));
	const total = $derived(rows.find((t) => t.account === account));
	const parts = $derived(partsOf(spending, account));
	const divides = $derived(rows.length > 1);
	const bars = $derived(barsOf({ spending, previous, account, parts }));
	const whole = $derived(wholeOf({ spending, previous, account, parts }));
	const other = $derived([whole, ...bars].some((b) => b[OTHER] !== '0'));

	const first = $derived(spending?.from ?? day);
	const last = $derived(spending?.to ?? day);
	const label = $derived(
		`Spending from ${formatDate(first)} to ${formatDate(last)}, ${formatAmount(total?.amount ?? '0')} in all`,
	);
	const months = $derived(monthsIn(first, last));

	const postingsOf = (a: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account: a, ...(period.kind === 'all' ? { range: 'all' } : { from: first, to: last }) })}`;
	const postingsOn = (day: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account, from: day, to: day })}`;
	const perMonth = (amount: string) => (Number(amount) / months).toFixed(2);
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Expenses</PageHeader>

<FilterRail>
	{#snippet filters()}
		<PeriodPicker current={period} shown={{ from: first, to: last }} today={day} first={earliest} />
		<AccountPicker
			current={account}
			accounts={(spending?.totals ?? []).map((t) => t.account)}
			top={EXPENSES}
		/>
	{/snippet}

	<Issues {handle} errors={response.errors} />

	<section aria-labelledby="spending">
		{#if divides && chart === 'flow'}
			<AlluvialChart
				{rows}
				{account}
				{parts}
				label="How {nameOf(account)} divides into the accounts under it, two levels deep"
				{summary}
			>
				{#snippet controls()}{@render charts()}{/snippet}
			</AlluvialChart>
		{:else if bucket === 'day'}
			<Calendar rows={bars} x="bucket" y="total" href={postingsOn} {label} {summary}>
				{#snippet controls()}{@render charts()}{/snippet}
			</Calendar>
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
				{#snippet controls()}
					{@render charts()}
					<ChoicePicker param="scale" label="Scale" choices={SCALE_LABELS} current={scale} />
				{/snippet}
			</BarChart>
		{/if}
	</section>

	{#snippet charts()}
		{#if divides}
			<ChoicePicker param="chart" label="Chart" choices={CHART_LABELS} current={chart} />
		{/if}
	{/snippet}

	{#snippet summary(index: number | null)}
		{@const bar = index === null ? undefined : bars[index]}
		{@const shown = bar?.total ?? total?.amount ?? '0'}
		{@const compared = bar ? bar[PREVIOUS] : totalOf(previous, account)}
		{@const change = compared ? formatChange(compared, shown) : null}
		<div class="summary">
			<h2 id="spending" class="label">Spending</h2>
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

	{#if rows.length > 0}
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
				{#each rows as row (row.account)}
					{@const depth = depthOf(row.account) - depthOf(account)}
					<tr>
						<th scope="row" class={{ nested: depth > 0 }}>
							<a
								href={postingsOf(row.account)}
								class="name plain"
								style:--depth={depth}
								title={row.account}
								><span class="prefix">{prefixOf(row.account)}</span>{nameOf(row.account)}</a
							>
							{#if parts.includes(row.account)}<Swatch
									shade={seriesOf(parts.indexOf(row.account))}
								/>{/if}
							{#if row.unpriced > 0}<span class="tag">{row.unpriced} unpriced</span>{/if}
						</th>
						<Amount value={row.amount} />
						<td class="amount share">
							{#if row.account !== account}{formatShare(row.amount, total?.amount ?? '0')}{/if}
						</td>
						{#if bucket !== 'day'}
							<Amount value={perMonth(row.amount)} compact optional />
						{/if}
					</tr>
				{/each}
			</tbody>
		</LedgerTable>
	{:else}
		<p>Nothing spent in this period.</p>
	{/if}
</FilterRail>

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
