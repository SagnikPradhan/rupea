<script lang="ts">
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import LineChart from '#lib/web/components/ui-chart-line/ui-chart-line.svelte';
	import { formatsHere } from '#lib/web/shared/format.ts';

	const formats = formatsHere();

	type Invested = { day: string; value: string; cost: string };

	const { invested }: { invested: Invested[] } = $props();

	const first = $derived(invested[0]);
	const last = $derived(invested.at(-1));
</script>

{#if first && last}
	<Panel title="Invested" subtitle="Is it worth more than what went in?">
		<LineChart
			rows={invested}
			x="day"
			series={[
				{ key: 'value', label: 'Value', role: 'primary' },
				{ key: 'cost', label: 'Cost', role: 'band' },
			]}
			label="Value against cost from {formats.date(first.day)} to {formats.date(
				last.day,
			)}, value {formats.whole(last.value)} on cost {formats.whole(last.cost)}"
			summary={valueOn}
		/>
	</Panel>
{/if}

{#snippet valueOn(index: number)}
	{@const shown = invested[index] ?? last}
	{#if shown}
		{@const gain = formats.change(shown.cost, shown.value)}
		<ChartSummary
			id="invested"
			label="Value"
			figure={formats.whole(shown.value)}
			exact={formats.exact(shown.value)}
		>
			<span class={gain.negative ? 'negative' : 'positive'}>
				Gain {gain.amount}{#if gain.percent !== null}&nbsp;({gain.percent}){/if}
			</span>
			{formats.date(shown.day)}
		</ChartSummary>
	{/if}
{/snippet}

<style>
	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
