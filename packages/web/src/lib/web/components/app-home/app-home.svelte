<script lang="ts">
	import {
		findBridge,
		listHoldings,
		listDeltas,
		listTerms,
	} from '#lib/endpoints/accounts.remote.ts';
	import { resolve } from '$app/paths';
	import { openingOf } from '@rupea/shared/dates.ts';
	import { EXPENSES, INCOME, printAmount, sum, type Amount } from '@rupea/shared/money.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Waterfall from '#lib/web/components/ui-chart-waterfall/ui-chart-waterfall.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import { stepsOf } from '#lib/web/shared/bridge.ts';
	import {
		formatAmount,
		formatChange,
		formatDate,
		formatIsoDate,
		formatMonthName,
		formatShare,
		formatWhole,
	} from '#lib/web/shared/format.ts';
	import { lastMonthOf, savedOf, statementOf } from '#lib/web/shared/home.ts';
	import * as Liabilities from '#lib/web/shared/liabilities.ts';

	const { handle }: { handle: string } = $props();

	const day = formatIsoDate(new Date());
	const today = Temporal.PlainDate.from(day);
	const now = { kind: 'month', at: day.slice(0, 7) } as const;
	const lastMonth = { kind: 'month', at: lastMonthOf(day) } as const;

	const loaded = $derived(
		await Promise.all([
			findBridge({ handle, day, period: openingOf(lastMonth, today) }),
			listDeltas({ handle, day, period: lastMonth, account: EXPENSES }),
			listDeltas({ handle, day, period: lastMonth, account: INCOME }),
			listHoldings({ handle, day, period: now }),
			listTerms({ handle, day }),
		]),
	);
	const [moved, spending, earning, balance, termed] = $derived(loaded);

	const bridge = $derived(moved.data?.[0]);
	const spent = $derived(statementOf(EXPENSES, spending.data?.[0], spending.data?.[1]));
	const income = $derived(statementOf(INCOME, earning.data?.[0], earning.data?.[1]));
	const saved = $derived(savedOf(income.total, spent.total));
	const month = $derived(formatMonthName(lastMonth.at + '-01'));
	const before = $derived(formatMonthName(lastMonthOf(lastMonth.at + '-01') + '-01'));

	const debts = $derived(
		Liabilities.debtsFrom(Liabilities.accountsIn(balance.data ?? []), termed.data ?? []),
	);
	const week = $derived({ from: today, to: today.add({ days: 7 }) });
	const dues = $derived(debts.flatMap((d) => Liabilities.duesOn(d, week)));
	const due = $derived(sum(dues.map((d) => d.amount)) as Amount);

	const worth = $derived(resolve('/(signed-in)/l/[handle]/net-worth', { handle }));
	const spentIn = $derived(
		`${resolve('/(signed-in)/l/[handle]/spending', { handle })}?at=${lastMonth.at}`,
	);
</script>

<Issues
	{handle}
	errors={[
		...(moved.errors ?? []),
		...(spending.errors ?? []),
		...(earning.errors ?? []),
		...(balance.errors ?? []),
		...(termed.errors ?? []),
	]}
/>

<PanelGrid narrow>
	<div>
		{#if bridge}
			{@const change = formatChange(bridge.start, bridge.end)}
			<ChartSummary id="moved" label="Net worth in {month}" lead figure={change.amount}>
				from {formatAmount(bridge.start)} to {formatAmount(bridge.end)} ·
				{formatDate(bridge.from)} – {formatDate(bridge.to)}
			</ChartSummary>
			<Waterfall
				steps={stepsOf(bridge)}
				label="Net worth from {formatWhole(bridge.start)} to {formatWhole(
					bridge.end,
				)}, by income, expenses and what prices did"
			/>
		{:else}
			<p>Nothing held last month.</p>
		{/if}
	</div>

	<KpiStrip label="Last month">
		<Kpi
			label="Net worth"
			figure={formatWhole(bridge?.end ?? '0')}
			detail="on {formatDate(bridge?.to ?? day)}"
			href={worth}
		/>
		<Kpi
			label="Saved in {month}"
			figure={formatWhole(printAmount(saved.amount))}
			detail="{formatShare(printAmount(saved.amount), printAmount(income.total.amount)) ??
				'0%'} of income"
			tone={saved.amount > 0n ? 'positive' : undefined}
			href={spentIn}
		/>
		<Kpi
			label="Spent in {month}"
			figure={formatWhole(printAmount(spent.total.amount))}
			detail={spent.total.change.percent
				? `${spent.total.change.percent} on ${before}`
				: `as in ${before}`}
			href={spentIn}
		/>
		<Kpi
			label="Due in 7 days"
			figure={formatWhole(printAmount(due))}
			detail="{dues.length} {dues.length === 1 ? 'payment' : 'payments'}"
			href="{worth}#owed"
		/>
	</KpiStrip>
</PanelGrid>
