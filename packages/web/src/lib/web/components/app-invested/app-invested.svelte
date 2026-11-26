<script lang="ts">
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import LineChart from '#lib/web/components/ui-chart-line/ui-chart-line.svelte';
	import { formatAmount, formatChange, formatDate, formatExact } from '#lib/web/shared/format.ts';

	type Invested = { day: string; value: string; cost: string };

	const { invested }: { invested: Invested[] } = $props();

	const first = $derived(invested[0]);
	const last = $derived(invested.at(-1));
</script>

{#if first && last}
	<Panel title="Invested" subtitle="what it is worth, against what went in">
		<LineChart
			rows={invested}
			x="day"
			series={[
				{ key: 'value', label: 'Value', role: 'primary' },
				{ key: 'cost', label: 'Cost', role: 'band' },
			]}
			label="Value against cost from {formatDate(first.day)} to {formatDate(
				last.day,
			)}, value {formatAmount(last.value)} on cost {formatAmount(last.cost)}"
			summary={valueOn}
		/>
	</Panel>
{/if}

{#snippet valueOn(index: number)}
	{@const shown = invested[index] ?? last}
	{#if shown}
		{@const gain = formatChange(shown.cost, shown.value)}
		<ChartSummary
			id="invested"
			label="Value"
			figure={formatAmount(shown.value)}
			exact={formatExact(shown.value)}
		>
			<span class={gain.negative ? 'negative' : 'positive'}>
				Gain {gain.amount}{#if gain.percent !== null}&nbsp;({gain.percent}){/if}
			</span>
			{formatDate(shown.day)}
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
