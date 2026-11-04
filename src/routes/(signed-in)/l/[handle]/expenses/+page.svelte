<script lang="ts">
	import { listSpending } from '#lib/endpoints/accounts.remote.ts';
	import { paramsOf, periodOf } from '#lib/shared/dates.ts';
	import { ExpenseAccount, EXPENSES } from '#lib/shared/accounts.ts';
	import { depthOf, nameOf } from '#lib/web/shared/accounts.ts';
	import { flowsOf } from '#lib/web/shared/alluvial.ts';
	import { OTHER, seriesOf } from '#lib/web/shared/chart.ts';
	import { Scale, SCALE_LABELS } from '#lib/web/shared/choices.ts';
	import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';
	import AlluvialChart from '#lib/web/components/ui-chart-alluvial/ui-chart-alluvial.svelte';
	import BarChart from '#lib/web/components/ui-chart-bar/ui-chart-bar.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import Calendar from '#lib/web/components/ui-chart-calendar/ui-chart-calendar.svelte';
	import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
	import ChoicePicker from '#lib/web/components/ui-picker-choice/ui-picker-choice.svelte';
	import FilterModal from '#lib/web/components/ui-filter-modal/ui-filter-modal.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import Swatch from '#lib/web/components/ui-swatch/ui-swatch.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import {
		formatAmount,
		formatBucket,
		formatChange,
		formatDate,
		formatExact,
		formatIsoDate,
		formatShare,
		formatWhole,
	} from '#lib/web/shared/format.ts';
	import { MONTHS, MONTHS_BRIEF, spanOf } from '#lib/web/shared/home.ts';
	import {
		barsOf,
		daysIn,
		largestFirst,
		monthsIn,
		partsOf,
		PREVIOUS,
		rowsOf,
		shownOf,
		totalOf,
		wholeOf,
	} from '#lib/web/shared/spending.ts';
	import { page } from '$app/state';
	import IconCollapsed from '@tabler/icons-svelte-runes/icons/chevron-right';
	import IconExpanded from '@tabler/icons-svelte-runes/icons/chevron-down';
	import { SvelteSet } from 'svelte/reactivity';
	import * as v from 'valibot';

	const PERIOD_PARAMS = ['at', 'range', 'from', 'to'];

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const span = $derived(
		v.parse(v.fallback(v.picklist(Object.keys(MONTHS)), ''), page.url.searchParams.get('span')),
	);
	const dated = $derived(PERIOD_PARAMS.some((p) => page.url.searchParams.has(p)));
	const period = $derived(
		span ? spanOf(span, day) : periodOf(page.url.searchParams, spanOf('12', day)),
	);
	const account = $derived(v.parse(ExpenseAccount, page.url.searchParams.get('account')));
	const scale = $derived(v.parse(v.fallback(Scale, 'linear'), page.url.searchParams.get('scale')));

	const response = $derived(await listSpending({ handle, day, period, account }));
	const spending = $derived(response.data?.[0]);
	const previous = $derived(response.data?.[1]);
	const bucket = $derived(spending?.bucket ?? 'month');

	const rows = $derived(rowsOf(spending?.totals ?? [], account));
	const ordered = $derived(largestFirst(rows, account));
	const opened = new SvelteSet<string>();
	const shown = $derived(shownOf(ordered, account, [...opened]));
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
	const days = $derived(daysIn(first, last));
	const groups = $derived(
		Object.fromEntries(
			(spending?.totals ?? [])
				.filter((t) => depthOf(t.account) === depthOf(EXPENSES) + 1)
				.map((t) => [t.account, nameOf(t.account)]),
		),
	);
	const accounts = $derived({
		'': 'All accounts',
		...groups,
		...(account === EXPENSES || account in groups ? {} : { [account]: nameOf(account) }),
	});
	const largest = $derived(ordered.find((r) => r.parent === account));
	const moved = $derived(
		previous ? formatChange(totalOf(previous, account) ?? '0', total?.amount ?? '0') : null,
	);

	const postingsOf = (a: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account: a, ...paramsOf(period) })}`;
	const postingsOn = (day: string) =>
		`/l/${handle}/postings?${new URLSearchParams({ account, from: day, to: day })}`;
	const perMonth = (amount: string) => (Number(amount) / months).toFixed(2);
	const fold = (a: string) => (opened.has(a) ? opened.delete(a) : opened.add(a));
</script>

<PageHeader subtitle="Where the money went, month by month">
	Expenses
	{#snippet actions()}
		<FilterModal params={['span', ...PERIOD_PARAMS, 'account']}>
			<FilterSection label="Period">
				<ChoicePicker
					param="span"
					label="Period"
					choices={MONTHS_BRIEF}
					current={span || (dated ? '' : '12')}
				/>
			</FilterSection>
			<FilterSection label="Accounts">
				<ChoiceChips
					param="account"
					label="Accounts"
					choices={accounts}
					current={account === EXPENSES ? '' : account}
				/>
			</FilterSection>
		</FilterModal>
	{/snippet}
</PageHeader>

<Issues {handle} errors={response.errors} />

<KpiStrip>
	<Kpi
		label="Spent"
		figure={formatWhole(total?.amount ?? '0')}
		detail={moved?.percent ? `${moved.percent} on the period before` : undefined}
	/>
	<Kpi
		label="A day"
		figure={formatWhole(String(Number(total?.amount ?? '0') / days))}
		detail="{days} {days === 1 ? 'day' : 'days'}"
	/>
	<Kpi
		label="Largest"
		figure={largest ? nameOf(largest.account) : '–'}
		detail={largest
			? `${formatWhole(largest.amount)} · ${formatShare(largest.amount, total?.amount ?? '0') ?? '0%'} of spending`
			: undefined}
	/>
	<Kpi label="Budgets over" soon />
</KpiStrip>

<PanelGrid wide>
	<Panel
		title="Where the money went"
		subtitle="what {nameOf(account)} divides into, two levels deep"
	>
		{#if divides}
			<AlluvialChart
				flows={flowsOf({ rows, account, parts })}
				label="How {nameOf(account)} divides into the accounts under it, two levels deep"
			/>
		{:else}
			<p>Nothing under {nameOf(account)} to divide.</p>
		{/if}
	</Panel>
	<Panel title="Budgets" subtitle="what each category was meant to take this month" soon />
</PanelGrid>

<PanelGrid wide>
	<Panel title="Spending by category" subtitle="{formatDate(first)} – {formatDate(last)}">
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
				{#snippet controls()}
					<ChoicePicker param="scale" label="Scale" choices={SCALE_LABELS} current={scale} />
				{/snippet}
			</BarChart>
		{/if}
	</Panel>
	<Panel title="Repeating payments" subtitle="rent, SIPs and subscriptions" soon />
</PanelGrid>

{#snippet summary(index: number | null)}
	{@const bar = index === null ? undefined : bars[index]}
	{@const shown = bar?.total ?? total?.amount ?? '0'}
	{@const compared = bar ? bar[PREVIOUS] : totalOf(previous, account)}
	{@const change = compared ? formatChange(compared, shown) : null}
	<ChartSummary
		id="spending"
		label="Spending"
		figure={formatAmount(shown)}
		exact={formatExact(shown)}
	>
		{#if change}
			<span class="nowrap">
				{change.amount}{#if change.percent !== null}&nbsp;({change.percent}){/if} vs previous ·
			</span>
		{/if}
		{bar ? formatBucket[bucket](bar.bucket) : `${formatDate(first)} – ${formatDate(last)}`}
		{#if total && total.unpriced > 0}
			<span class="nowrap">· excludes {total.unpriced} unpriced</span>
		{/if}
	</ChartSummary>
{/snippet}

<Panel title="Spending by account" subtitle="what each account took, and its share of the whole">
	{#if rows.length > 0}
		<LedgerTable
			columns={[
				{ label: 'Account' },
				{ label: 'Spent', kind: 'amount' },
				{ label: 'Share', kind: 'amount', optional: true },
				...(bucket === 'day'
					? []
					: [{ label: 'Per month', kind: 'amount' as const, optional: true }]),
			]}
		>
			<tbody>
				{#each shown as row (row.account)}
					{@const depth = depthOf(row.account) - depthOf(account)}
					{@const folds = row.account !== account && rows.some((r) => r.parent === row.account)}
					{@const Chevron = opened.has(row.account) ? IconExpanded : IconCollapsed}
					<tr>
						<th scope="row">
							{#if folds}<button
									class="fold"
									aria-label="Accounts under {nameOf(row.account)}"
									aria-expanded={opened.has(row.account)}
									onclick={() => fold(row.account)}><Chevron size={16} /></button
								>{/if}<a href={postingsOf(row.account)} title={row.account}
								><AccountName account={row.account} depth={folds ? depth - 1 : depth} /></a
							>
							{#if parts.includes(row.account)}<Swatch
									shade={seriesOf(parts.indexOf(row.account))}
								/>{/if}
							{#if row.unpriced > 0}<Tag>{row.unpriced} unpriced</Tag>{/if}
						</th>
						<Amount value={row.amount} />
						<td class="amount share optional">
							{#if row.account !== account}{formatShare(row.amount, total?.amount ?? '0')}{/if}
						</td>
						{#if bucket !== 'day'}
							<Amount value={perMonth(row.amount)} optional />
						{/if}
					</tr>
				{/each}
			</tbody>
		</LedgerTable>
	{:else}
		<p>Nothing spent in this period.</p>
	{/if}
</Panel>

<style>
	.nowrap {
		white-space: nowrap;
	}

	.share {
		color: var(--color-muted);
	}

	.fold {
		display: inline-flex;
		width: var(--size-2);
		padding: 0;
		border: none;
		background: none;
		color: var(--color-muted);
		vertical-align: middle;
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
