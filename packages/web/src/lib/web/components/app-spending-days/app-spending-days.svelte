<script lang="ts">
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import Calendar from '#lib/web/components/ui-chart-calendar/ui-chart-calendar.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import { formatAmount, formatDate } from '#lib/web/shared/format.ts';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';

	type Props = {
		daily: { day: string; amount: string }[];
		account: string;
	};

	const { daily, account }: Props = $props();

	const busiest = $derived(
		daily.reduce(
			(a, b) => (Math.abs(Number(b.amount)) > Math.abs(Number(a?.amount ?? 0)) ? b : a),
			daily[0],
		),
	);
</script>

{#snippet summary(index: number | null)}
	{@const shown = index === null ? busiest : daily[index]}
	{#if shown}
		<ChartSummary id="days" label="Spent in a day" figure={formatAmount(shown.amount)}>
			{index === null ? 'Most, on' : 'On'}
			{formatDate(shown.day)}
		</ChartSummary>
	{/if}
{/snippet}

<Panel title="Day by day" subtitle="what {nameOf(account)} came to on each day">
	<Calendar
		rows={daily}
		x="day"
		y="amount"
		across
		labelled={false}
		label="Spending on each day of the period"
		{summary}
	/>
</Panel>
