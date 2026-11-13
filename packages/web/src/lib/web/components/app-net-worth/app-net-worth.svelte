<script lang="ts">
	import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
	import LineChart from '#lib/web/components/ui-chart-line/ui-chart-line.svelte';
	import { formatAmount, formatChange, formatDate, formatExact } from '#lib/web/shared/format.ts';
	import { areasOf, withAreas } from '#lib/web/shared/worth.ts';

	type Worth = {
		day: string;
		assets: string;
		liabilities: string;
		worth: string;
		parts: { account: string; commodity: string | null; amount: string }[];
		unpriced: number;
	};

	const { worth }: { worth: Worth[] } = $props();

	const first = $derived(worth[0]);
	const last = $derived(worth.at(-1));
	const areas = $derived(areasOf(worth));
	const rows = $derived(withAreas(worth, areas));
	const owing = $derived(worth.some((w) => Number(w.liabilities) !== 0));
</script>

{#if first && last}
	<section aria-labelledby="worth">
		<LineChart
			{rows}
			x="day"
			series={[
				{ key: 'worth', label: 'Net worth', role: 'primary' },
				...areas.map((a) => ({
					key: a.key,
					label: a.label,
					role: 'part' as const,
					shade: a.shade,
				})),
				...(owing ? [{ key: 'liabilities', label: 'Owed', role: 'negative' as const }] : []),
			]}
			label="Net worth from {formatDate(first.day)} to {formatDate(last.day)}, {formatAmount(
				first.worth,
			)} to {formatAmount(last.worth)}"
			summary={worthOn}
		/>
	</section>
{/if}

{#snippet worthOn(index: number)}
	{@const shown = worth[index] ?? last}
	{#if first && shown}
		{@const change = formatChange(first.worth, shown.worth)}
		<ChartSummary
			id="worth"
			label="Net worth"
			figure={formatAmount(shown.worth)}
			exact={formatExact(shown.worth)}
		>
			<span class={change.negative ? 'negative' : 'positive'}>
				{change.amount}{#if change.percent !== null}&nbsp;({change.percent}){/if}
			</span>
			{formatDate(first.day)} – {formatDate(shown.day)}
			{#if shown.unpriced > 0}
				<span class="nowrap">· excludes {shown.unpriced} unpriced</span>
			{/if}
		</ChartSummary>
	{/if}
{/snippet}

<style>
	.nowrap {
		white-space: nowrap;
	}

	.positive {
		color: var(--color-positive);
	}

	.negative {
		color: var(--color-negative);
	}
</style>
