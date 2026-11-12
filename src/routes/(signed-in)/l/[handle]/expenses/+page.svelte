<script lang="ts">
	import { listDailyDeltas, listDeltas } from '#lib/endpoints/accounts.remote.ts';
	import { ZERO, printAmount } from '#lib/shared/amounts.ts';
	import { PERIOD_PARAMS, paramsOf } from '#lib/shared/dates.ts';
	import { EXPENSES, INCOME } from '#lib/shared/accounts.ts';
	import { depthOf, nameOf } from '#lib/web/shared/accounts.ts';
	import { flowsOf } from '#lib/web/shared/alluvial.ts';
	import { coloursOf, distinctOf, OTHER, PARTS, seriesOf, tintOf } from '#lib/web/shared/chart.ts';
	import { COMPARE_LABELS, SCALE_LABELS } from '#lib/web/shared/choices.ts';
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
	import { postingsHref } from '#lib/web/shared/links.ts';
	import { MONTHS_BRIEF } from '#lib/web/shared/home.ts';
	import { readQuery } from '#lib/web/shared/query.svelte.ts';
	import * as Spending from '#lib/web/shared/spending.ts';
	import IconCollapsed from '@tabler/icons-svelte-runes/icons/chevron-right';
	import IconExpanded from '@tabler/icons-svelte-runes/icons/chevron-down';
	import { SvelteSet } from 'svelte/reactivity';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const url = readQuery(Spending.SpendingQuery(day));

	const [response, earned, daily] = $derived(
		await Promise.all([
			listDeltas({ handle, day, period: url.query.period, account: url.query.account }),
			url.query.account === EXPENSES
				? listDeltas({ handle, day, period: url.query.period, account: INCOME })
				: undefined,
			listDailyDeltas({ handle, day, period: url.query.period, account: url.query.account }),
		]),
	);
	const spending = $derived(response.data?.[0]);
	const previous = $derived(response.data?.[1]);
	const bucket = $derived(spending?.bucket ?? 'month');

	const rows = $derived(Spending.rowsOf(spending?.totals ?? [], url.query.account));
	const ordered = $derived(Spending.largestFirst(rows, url.query.account));
	const opened = new SvelteSet<string>();
	const shown = $derived(Spending.shownOf(ordered, url.query.account, [...opened]));
	const total = $derived(rows.find((t) => t.account === url.query.account));
	const parts = $derived(Spending.partsOf(spending, url.query.account));
	const colours = $derived(distinctOf(parts, coloursOf(parts)));
	const divides = $derived(rows.length > 1);
	const flows = $derived(
		flowsOf({
			rows,
			account: url.query.account,
			parts,
			colours,
			income: earned?.data?.[0]?.totals ?? [],
		}),
	);
	const kept = $derived(flows.some((f) => f.into !== null));
	const bars = $derived(Spending.barsOf({ spending, previous, account: url.query.account, parts }));
	const whole = $derived(
		Spending.wholeOf({ spending, previous, account: url.query.account, parts }),
	);
	const other = $derived([whole, ...bars].some((b) => b[OTHER] !== '0'));

	const first = $derived(spending?.from ?? today);
	const last = $derived(spending?.to ?? today);
	const label = $derived(
		`Spending from ${formatDate(first.toString())} to ${formatDate(last.toString())}, ${formatAmount(printAmount(total?.amount ?? ZERO))} in all`,
	);
	const days = $derived(Spending.daysIn(first, last));
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
		...(url.query.account === EXPENSES || url.query.account in groups
			? {}
			: { [url.query.account]: nameOf(url.query.account) }),
	});
	const averages = $derived(
		(daily.data ?? []).map((d) => ({
			day: `2000-01-${String(d.day).padStart(2, '0')}`,
			total: d.amount,
		})),
	);
	const largest = $derived(ordered.find((r) => r.parent === url.query.account));
	const moved = $derived(
		previous
			? formatChange(
					printAmount(Spending.totalOf(previous, url.query.account) ?? ZERO),
					printAmount(total?.amount ?? ZERO),
				)
			: null,
	);

	const parents = $derived(Object.fromEntries(rows.map((r) => [r.account, r.parent])));
	const partOf = (a: string, depth = 0): { part: string; depth: number } | null => {
		if (parts.includes(a)) return { part: a, depth };
		const parent = parents[a];
		return parent ? partOf(parent, depth + 1) : null;
	};
	const postingsOf = (a: string) =>
		postingsHref(handle, { account: a, ...paramsOf(url.query.period) });
	const postingsOn = (day: string) =>
		postingsHref(handle, { account: url.query.account, from: day, to: day });
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
					current={url.query.span || (url.query.dated ? '' : '12')}
				/>
			</FilterSection>
			<FilterSection label="Accounts">
				<ChoiceChips
					param="account"
					label="Accounts"
					choices={accounts}
					current={url.query.account === EXPENSES ? '' : url.query.account}
				/>
			</FilterSection>
		</FilterModal>
	{/snippet}
</PageHeader>

<Issues
	{handle}
	errors={[...(response.errors ?? []), ...(earned?.errors ?? []), ...(daily.errors ?? [])]}
/>

<PanelGrid narrow>
	<div>
		{#if bucket === 'day'}
			<Calendar rows={bars} x="bucket" y="total" href={postingsOn} {label} {summary} />
		{:else}
			<BarChart
				rows={bars}
				x="bucket"
				{bucket}
				series={[
					...parts.map((p, k) => ({
						key: p,
						label: nameOf(p),
						role: 'part' as const,
						colour: colours[p] ?? k,
					})),
					...(other
						? [{ key: OTHER, label: OTHER, role: 'part' as const, colour: PARTS - 1 }]
						: []),
					...(previous && url.query.compare === 'with'
						? [{ key: Spending.PREVIOUS, label: Spending.PREVIOUS, role: 'reference' as const }]
						: []),
				]}
				{whole}
				{label}
				scale={url.query.scale}
				{summary}
			>
				{#snippet controls()}
					{#if previous}
						<ChoicePicker
							param="compare"
							label="Comparison"
							choices={COMPARE_LABELS}
							current={url.query.compare}
						/>
					{/if}
					<ChoicePicker
						param="scale"
						label="Scale"
						choices={SCALE_LABELS}
						current={url.query.scale}
					/>
				{/snippet}
			</BarChart>
		{/if}
	</div>
	<KpiStrip>
		<Kpi
			label="Spent"
			figure={formatWhole(printAmount(total?.amount ?? ZERO))}
			detail={moved?.percent ? `${moved.percent} on the period before` : undefined}
		/>
		<Kpi
			label="A day"
			figure={formatWhole(printAmount(Spending.dailyAverageOver(total?.amount ?? ZERO, days)))}
			detail="{days} {days === 1 ? 'day' : 'days'}"
		/>
		<Kpi
			label="Largest"
			figure={largest ? nameOf(largest.account) : '–'}
			detail={largest
				? `${formatWhole(printAmount(largest.amount))} · ${formatShare(printAmount(largest.amount), printAmount(total?.amount ?? ZERO)) ?? '0%'} of spending`
				: undefined}
		/>
		<Kpi label="Budgets over" soon />
	</KpiStrip>
</PanelGrid>

<PanelGrid>
	<Panel
		title="Where the money went"
		subtitle={kept
			? 'what came in, then what was spent and what was kept'
			: `what ${nameOf(url.query.account)} divides into, two levels deep`}
	>
		{#if divides}
			<AlluvialChart
				{flows}
				label={kept
					? 'How what came in divides into what was spent and what was kept'
					: `How ${nameOf(url.query.account)} divides into the accounts under it, two levels deep`}
			/>
		{:else}
			<p>Nothing under {nameOf(url.query.account)} to divide.</p>
		{/if}
	</Panel>
	<div class="column">
		<Panel title="Budgets" subtitle="what each category was meant to take this month" soon />
		<Panel title="Repeating payments" subtitle="rent, SIPs and subscriptions" soon />
	</div>
</PanelGrid>

{#snippet summary(index: number | null)}
	{@const bar = index === null ? undefined : bars[index]}
	{@const shown = bar?.total ?? printAmount(total?.amount ?? ZERO)}
	{@const before = Spending.totalOf(previous, url.query.account)}
	{@const compared = bar ? bar[Spending.PREVIOUS] : printAmount(before)}
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
		{bar
			? formatBucket[bucket](bar.bucket)
			: `${formatDate(first.toString())} – ${formatDate(last.toString())}`}
		{#if total && total.unpriced > 0}
			<span class="nowrap">· excludes {total.unpriced} unpriced</span>
		{/if}
	</ChartSummary>
{/snippet}

<PanelGrid>
	<Panel title="Day of the month" subtitle="what {nameOf(url.query.account)} averaged on each day">
		<Calendar
			rows={averages}
			x="day"
			y="total"
			weekly={false}
			squircles
			label="Average spending on each day of the month, over the period"
		/>
	</Panel>
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
						{@const depth = depthOf(row.account) - depthOf(url.query.account)}
						{@const folds =
							row.account !== url.query.account && rows.some((r) => r.parent === row.account)}
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
								{#if partOf(row.account)}
									{@const under = partOf(row.account)}
									<Swatch
										shade={seriesOf(colours[under?.part ?? ''] ?? 0)}
										tint={tintOf(under?.depth ?? 0)}
									/>
								{/if}
								{#if row.unpriced > 0}<Tag>{row.unpriced} unpriced</Tag>{/if}
							</th>
							<Amount value={printAmount(row.amount)} />
							<td class="amount share optional">
								{#if row.account !== url.query.account}{formatShare(
										printAmount(row.amount),
										printAmount(total?.amount ?? ZERO),
									)}{/if}
							</td>
							{#if bucket !== 'day'}
								<Amount
									value={printAmount(Spending.monthlyAverageOver(row.amount, days))}
									optional
								/>
							{/if}
						</tr>
					{/each}
				</tbody>
			</LedgerTable>
		{:else}
			<p>Nothing spent in this period.</p>
		{/if}
	</Panel>
</PanelGrid>

<style>
	.column {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

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
