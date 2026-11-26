<script lang="ts">
	import BarChart from '#lib/web/components/ui-chart-bar/ui-chart-bar.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import { BASE, formatsIn, formatBucket, formatDate } from '#lib/web/shared/format.ts';
	import { getContext } from 'svelte';
	import type { Grain } from '@rupea/shared/dates.ts';
	import * as Income from '#lib/web/shared/income.ts';
	import * as Spending from '#lib/web/shared/spending.ts';

	const formats = formatsIn(getContext<() => string>(BASE)?.());

	type Props = {
		bucket: Grain;
		income: Spending.Spent | undefined;
		spending: Spending.Spent | undefined;
		paid: Income.Paid[];
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
	};

	const { bucket, income, spending, paid, first, last }: Props = $props();

	const bars = $derived(Income.monthsOf({ income, spending, paid }));
	const whole = $derived(Income.wholeOf({ income, spending, paid }));
	const label = $derived(
		`Income from ${formatDate(first.toString())} to ${formatDate(last.toString())}, ${formats.amount(whole.total)} in all, ${formats.amount(whole[Income.SPENT])} spent, ${formats.amount(whole[Income.INVESTED])} invested, ${formats.amount(whole[Income.KEPT])} kept`,
	);
</script>

<section aria-labelledby="income">
	<BarChart
		rows={bars}
		x="bucket"
		{bucket}
		series={[
			{ key: Income.SPENT, label: Income.SPENT, role: 'part', shade: '--color-ink-6' },
			{ key: Income.INVESTED, label: Income.INVESTED, role: 'part', shade: '--color-ink-4' },
			{ key: Income.KEPT, label: Income.KEPT, role: 'part', shade: '--color-ink-2' },
			{
				key: Income.FROM_SAVINGS,
				label: Income.FROM_SAVINGS,
				role: 'part',
				shade: '--color-negative-4',
			},
		]}
		{whole}
		{label}
		{summary}
	/>
</section>

{#snippet summary(index: number | null)}
	{@const bar = index === null ? undefined : bars[index]}
	{@const figure = bar?.total ?? whole.total}
	{@const shown = bar ?? whole}
	<ChartSummary
		id="income"
		label="Earned"
		lead
		figure={formats.amount(figure)}
		exact={formats.exact(figure)}
	>
		{formats.share(Income.savedOf(shown), figure) ?? '0%'} saved:
		{formats.share(shown[Income.INVESTED], figure) ?? '0%'} invested,
		{formats.share(shown[Income.KEPT], figure) ?? '0%'} kept ·
		{bar
			? formatBucket[bucket](bar.bucket)
			: `${formatDate(first.toString())} – ${formatDate(last.toString())}`}
	</ChartSummary>
{/snippet}
