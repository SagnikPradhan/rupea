<script lang="ts">
	import Calendar from '#lib/web/components/ui-chart-calendar/ui-chart-calendar.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';

	const formats = formatsHere();

	type Props = {
		daily: { day: string; amount: string }[];
	};

	const { daily }: Props = $props();

	const busiest = $derived(
		daily
			.filter((d) => Number(d.amount) > 0)
			.toSorted((a, b) => Number(b.amount) - Number(a.amount))[0],
	);
</script>

{#snippet summary(index: number | null)}
	{@const shown = index === null ? busiest : daily[index]}
	{#if shown}
		<ChartSummary
			id="days"
			label={index === null ? 'Most in a day' : 'Spent'}
			figure={formats.amount(shown.amount)}
		>
			{formats.date(shown.day)}
		</ChartSummary>
	{/if}
{/snippet}

<Panel title="Day by day" subtitle="Which days cost the most?">
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
