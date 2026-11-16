<script lang="ts">
	import BarChart from '#lib/web/components/ui-chart-bar/ui-chart-bar.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import {
		formatAmount,
		formatBucket,
		formatDate,
		formatExact,
		formatShare,
	} from '#lib/web/shared/format.ts';
	import type { Grain } from '@rupea/shared/dates.ts';
	import * as Income from '#lib/web/shared/income.ts';
	import type { Spent } from '#lib/web/shared/spending.ts';

	type Props = {
		bucket: Grain;
		income: Spent | undefined;
		paid: Income.Paid[];
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
	};

	const { bucket, income, paid, first, last }: Props = $props();

	const bars = $derived(Income.investedOf(income, paid));
	const whole = $derived(Income.investedWholeOf(income, paid));
	const label = $derived(
		`Income from ${formatDate(first.toString())} to ${formatDate(last.toString())}, ${formatAmount(whole.total)} in all, ${formatAmount(whole[Income.INVESTED])} invested`,
	);
</script>

<Panel
	title="Income and invested"
	subtitle="income, split into what went into holdings with lots and what did not"
>
	<BarChart
		rows={bars}
		x="bucket"
		{bucket}
		series={[
			{ key: Income.INVESTED, label: Income.INVESTED, role: 'part', colour: 0 },
			{ key: Income.NOT_INVESTED, label: Income.NOT_INVESTED, role: 'part', colour: 1 },
		]}
		{whole}
		{label}
		{summary}
	/>
</Panel>

{#snippet summary(index: number | null)}
	{@const bar = index === null ? undefined : bars[index]}
	{@const figure = bar?.total ?? whole.total}
	{@const into = bar?.[Income.INVESTED] ?? whole[Income.INVESTED]}
	<ChartSummary
		id="invested"
		label="Invested"
		figure={formatAmount(into)}
		exact={formatExact(into)}
	>
		of {formatAmount(figure)} income · {formatShare(into, figure) ?? '0%'} ·
		{bar
			? formatBucket[bucket](bar.bucket)
			: `${formatDate(first.toString())} – ${formatDate(last.toString())}`}
	</ChartSummary>
{/snippet}
