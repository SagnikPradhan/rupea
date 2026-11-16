<script lang="ts">
	import BarChart from '#lib/web/components/ui-chart-bar/ui-chart-bar.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import {
		formatAmount,
		formatBucket,
		formatDate,
		formatExact,
		formatShare,
	} from '#lib/web/shared/format.ts';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	type Props = {
		income: Spending.Spent | undefined;
		spending: Spending.Spent | undefined;
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
	};

	const { income, spending, first, last }: Props = $props();

	const bars = $derived(Income.monthsOf(income, spending));
	const whole = $derived(Income.wholeOf(income, spending));
	const label = $derived(
		`Income from ${formatDate(first.toString())} to ${formatDate(last.toString())}, ${formatAmount(whole.total)} in all, ${formatAmount(whole[Income.SAVED])} kept`,
	);
</script>

<section aria-labelledby="income">
	<BarChart
		rows={bars}
		x="bucket"
		bucket="month"
		series={[
			{ key: Income.SPENT, label: Income.SPENT, role: 'part', colour: 0 },
			{ key: Income.SAVED, label: Income.SAVED, role: 'part', colour: 1 },
		]}
		{whole}
		{label}
		{summary}
	/>
</section>

{#snippet summary(index: number | null)}
	{@const bar = index === null ? undefined : bars[index]}
	{@const figure = bar?.total ?? whole.total}
	{@const kept = bar?.[Income.SAVED] ?? whole[Income.SAVED]}
	<ChartSummary
		id="income"
		label="Income"
		figure={formatAmount(figure)}
		exact={formatExact(figure)}
	>
		{formatShare(kept, figure) ?? '0%'} kept ·
		{bar
			? formatBucket.month(bar.bucket)
			: `${formatDate(first.toString())} – ${formatDate(last.toString())}`}
	</ChartSummary>
{/snippet}
